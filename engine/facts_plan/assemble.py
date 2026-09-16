"""`facts-plan digest | assemble | report` (§2.6, §2.7), and the `facts-unit`
content pass.

A unit's output is checked the moment it returns (QF-51), by the same rules
`assemble` will later rely on — a document that passes here is one `assemble`
can fold in without asking the model anything twice.

The verbs land here as the tasks that implement them do; `cli.py` reports a
verb whose function is not here yet rather than failing to import.
"""
import collections
import copy
import functools
import hashlib
import json
import pathlib
import re
import sys
from dataclasses import replace

from engine_common import (LINE_CAP, read_json, schema_dir, validate,
                           write_json_atomic, write_text_atomic)
from merge_facts import (KIND_ORDER, _sheet_identities,
                         canonical_scope, get_path, iter_ref_objects,
                         load_store, null_paths, path_exists, set_path, tiers)
from merge_facts.apply import _derive_row_keys
from merge_facts.audit import flags_over
from merge_facts.content import _check_prose, check_document
from merge_facts.conventions import DEFAULT as DEFAULT_CONVENTIONS
from merge_facts.conventions import load as load_conventions
from merge_facts.normalise import normalise_entry
from merge_facts.preconditions import (REQUIRED_SLOTS, _ref_sites, _registered,
                                       _unit_row_keys, keyless_row_findings,
                                       process_findings,
                                       undeclared_unit_findings)
from merge_facts.preconditions import _sever as _sever_member
from merge_facts.tiers import note, refuse

from facts_plan.build import (SIDECAR_DIR, TRANSCRIPT_DIR, TRANSCRIPT_EXT,
                              _tokens, estimate_tokens, label_of,
                              process_index, shape_section)

def _refs(value):
    """Every `{ref, field?}` object in a decision, in document order."""
    if isinstance(value, dict):
        if "ref" in value:
            yield value
        for member in value.values():
            yield from _refs(member)
    elif isinstance(value, list):
        for member in value:
            yield from _refs(member)


def validate_unit(root, run_dir, path):
    """Every finding for one `facts-unit` document (spec 2026-09-13 §5A): a
    REFUSE labelled `decisions[N] …` or `new[N] …` costs that item alone, one
    labelled otherwise costs the document, and a NOTE costs nothing.

    Checks, in order: the attempt cap and the JSON; the document's own shape,
    repaired where the meaning cannot change; each decision and `new[]` entry
    against the schema on its own; the `units/<id>/` directory the document
    sits in; every candidate of that unit decided (a note — a retry decides
    only what an earlier attempt did not); `S-` refs, node citations, columns,
    swapped inputs and the §5.2 lint; then the store contract over the entries
    the document materialises.
    """
    return _judge(root, run_dir, path)[1]


#: A7 — what a decision or a `new[]` entry may not write, because the engine
#: builds it (INV-1, INV-3): the unit's copy is dropped, never merged or kept.
ENGINE_OWNED = ("id", "source", "scope", "field_status", "accounts", "retired",
                "voice", "from")
#: …and, under a decision's `data`, the candidate's own payload members.
ENGINE_OWNED_DATA = ("code", "instances", "applies_to", "location")

#: The Persian a note leaves on the entry for the panel (§4). Never a pipeline
#: word, a sheet word or a Latin one: step 8 lints `issues[]` like any prose.
FA_NO_STATEMENT = "برای این مورد جمله‌ای نوشته نشد؛ پیش از تأیید، توضیح آن را کامل کنید."
FA_ONE_PART = "این مورد قرار بود به چند مورد تقسیم شود اما یک بخش داشت و به همان صورت ثبت شد."
FA_ALL_TAKES = ("برای یک بخش از این تقسیم مشخص نشد کدام نسخه‌ها را در بر می‌گیرد؛ "
                "همهٔ نسخه‌ها به آن نسبت داده شد.")
FA_TWICE = "دربارهٔ این مورد دو توصیف متفاوت نوشته شد؛ توصیف اول ثبت شد."
FA_CROSS_KIND = "این مورد قرار بود در موردی از نوع دیگر ادغام شود؛ به‌جای آن جداگانه ثبت شد."
FA_CITATION = "ارجاعی به مرحله‌ای از فرایند که پیدا نشد برداشته شد."
FA_NO_COLUMN = "توضیحی که برای یکی از عنوان‌های این جدول نوشته شد به هیچ عنوانی نرسید."
FA_SEVERED = "پیوند این مورد به موردی که در این اجرا وجود ندارد برداشته شد."
FA_SWAPPED = "ورودی‌های این قاعده ممکن است جابه‌جا نوشته شده باشند؛ پیش از تأیید بازبینی کنید."
FA_UNIT_ON_TEXT = "برای مقداری که عددی نیست واحد نوشته شده است؛ پیش از تأیید بازبینی کنید."
FA_UNTITLED = "موردی بی‌عنوان"
FA_BRANCH = "شعبه‌ای که برای این مورد نوشته شد در فهرست شعبه‌ها نبود و کنار گذاشته شد."


@functools.lru_cache(maxsize=None)
def _allowed(name):
    """The member names `facts-unit.schema.json` gives one closed object."""
    schema = read_json(schema_dir() / "facts-unit.schema.json")
    return frozenset((schema if name == "root" else schema["$defs"][name])["properties"])


def _clean_key(value):
    """A8 — trim, lower-case, and spaces and `-` to `_`."""
    return re.sub(r"[ \-]", "_", value.strip().lower()) \
        if isinstance(value, str) else value


def _plain(value):
    """A leaf without its `{value, inferred}` wrapper — `_unwrap`'s own test."""
    return value["value"] if isinstance(value, dict) \
        and set(value) == {"value", "inferred"} else value


def _labelled(label, items):
    """Findings from a producer handed `label` (or none), all under `label` —
    an assembly label (`u-a: key`) carries a `: ` of its own."""
    out = []
    for finding in items:
        line = finding.line()
        message = line[len(label) + 2:] if line.startswith(label + ": ") else line
        out.append(replace(finding, label=label, message=message))
    return out


def _stash(obj, name, prefix, extra):
    """A6 — a member the unit contract does not name moves to the entry's
    `extra` bag under its path, so nothing the unit wrote is lost."""
    for key in sorted(set(obj) - _allowed(name)):
        extra[prefix + key] = obj.pop(key)


def _repair(item, where, ctx):
    """A6–A14, A21, A23, A24 over one decision or `new[]` entry, in place and
    before the schema sees it. Returns `[(message, path, mark, fa)]`, the notes
    a repair that changed what is stored leaves behind."""
    notes = []
    extra = item.pop("extra", None)
    extra = dict(extra) if isinstance(extra, dict) else {}
    for key in ENGINE_OWNED:
        item.pop(key, None)
    decision = where == "decisions"
    if decision and item.get("skeleton") and "entry" in item:
        item.pop("entry")                                           # A14
    _stash(item, "decision" if decision else "newEntry", "", extra)
    for name in ("entry", "into"):
        if isinstance(item.get(name), dict):
            _stash(item[name], "entryAddr", f"{name}/", extra)
            if isinstance(item[name].get("scope"), dict):
                _stash(item[name]["scope"], "scope", f"{name}/scope/", extra)
    kinds, skid = ctx["kinds"], item.get("skeleton")
    into = item.get("into")
    if decision and item.get("action") == "merge_into" and isinstance(into, str) \
            and skid in kinds and into in kinds and kinds[skid] != kinds[into] \
            and isinstance(item.get("key"), str) and isinstance(item.get("title"), str):
        # A22, section 9 — the rule stands as its own entry.
        item["action"] = "keep"
        item.pop("into")
        notes.append((f"merge_into: a {kinds[skid]} cannot merge into a "
                      f"{kinds[into]} ({into}); kept as its own entry",
                      None, "issue", FA_CROSS_KIND))
    parts = []
    if decision and item.get("action") == "split" and isinstance(into, list):
        parts = [p for p in into if isinstance(p, dict)]
        for n, part in enumerate(parts):
            _stash(part, "splitPart", f"into/{n}/", extra)
            if not part.get("takes"):                               # A13
                part.pop("takes", None)
                notes.append((f"into[{n}]: no takes, so the part keeps every "
                              "binding", None, "issue", FA_ALL_TAKES))
        if len(into) == 1 and parts:
            part = parts.pop()
            for key in ("into", "reason_code"):
                item.pop(key, None)
            item.update({k: part[k] for k in ("key", "title", "statement", "data")
                         if k in part})
            item["action"] = "keep"
            notes.append(("split into one part: kept as that part", None, "issue",
                          FA_ONE_PART))
    if decision and item.get("action") in ("drop", "merge_into", "split") \
            and item.get("reason_code") not in REASON_FA:           # A11
        raw = item.pop("reason_code", None)
        if isinstance(raw, str) and raw and not item.get("reason"):
            item["reason"] = raw
        item["reason_code"] = "other"
    for obj in [item, *parts, item.get("entry"), item.get("into")]:
        if isinstance(obj, dict) and "key" in obj:                  # A8
            obj["key"] = _clean_key(obj["key"])
    for part in parts:
        if isinstance(part.get("takes"), list):
            part["takes"] = [_clean_key(t) for t in part["takes"]]
    for holder in ([item] if not decision or item.get("action") == "keep" else []) \
            + parts:
        if holder.get("statement") is None:                         # A9
            holder["statement"] = ""
            notes.append(("no statement", None, "issue", FA_NO_STATEMENT))
    if not decision and "data" not in item:
        item["data"] = {}                                           # A25
    for ref in _refs(item):                                         # A21
        field = ref.get("field")
        if isinstance(field, str) and field.strip()[:2].lower() == "c_":
            ref["field"] = field.strip().lower()
    cited = item.get("processes")
    if isinstance(cited, list):                                     # A23
        kept = []
        for n, citation in enumerate(cited):
            if not isinstance(citation, dict):
                kept.append(citation)
                continue
            _stash(citation, "procCite", f"processes/{n}/", extra)
            node = f'{citation.get("process")}::{citation.get("node")}'
            if node in ctx["node_ids"]:
                kept.append(citation)
            else:
                notes.append((f'node {citation.get("node")} is in no process of '
                              f'{ctx["department"]}; citation dropped', None,
                              "issue", FA_CITATION))
        item["processes"] = kept
    if decision:
        columns = {f.get("key") for f in _members(
            (ctx["candidates"].get(skid) or {}).get("payload") or {}, "fields")}
        for holder in [item, *parts]:
            data = holder.get("data")
            if not isinstance(data, dict):
                continue
            for key in ENGINE_OWNED_DATA:                           # A7
                data.pop(key, None)
            if not isinstance(data.get("fields"), list):
                continue
            kept = []
            for i, field in enumerate(data["fields"]):              # A24
                written = field.get("from") if isinstance(field, dict) else None
                if not isinstance(field, dict) or (
                        isinstance(written, str) and (not skid or written in columns)):
                    kept.append(field)
                    continue
                name = written if isinstance(written, str) else field.get("key")
                where = f"data/fields/{name if isinstance(name, str) else i}"
                key, k = where, 1
                while key in extra:
                    k += 1
                    key = f"{where}~{k}"
                extra[key] = field                  # M-5: kept, not only printed
                notes.append((f"data.fields[{i}].from: {written!r} names no column "
                              f"of this candidate; kept in extra: "
                              f"{json.dumps(field, ensure_ascii=False)}",
                              None, "issue", FA_NO_COLUMN))
            data["fields"] = kept
    if extra:
        item["extra"] = extra
    return notes


def _lifted(item):
    """A6 — the members of a decision's `data` and its fields the unit contract
    does not name, taken out for the schema check and put back after it: they
    pass through to the store schema, which knows them or keeps them (C5).
    Returns the function that puts them back."""
    held, into = [], item.get("into")
    parts = [p for p in into if isinstance(p, dict)] if isinstance(into, list) else []
    for holder in [item, *parts]:
        data = holder.get("data")
        if not isinstance(data, dict):
            continue
        members = [(data, "decisionData")] + [(f, "decisionField") for f in
                                               _members(data, "fields")]
        for obj, name in members:
            for key in sorted(set(obj) - _allowed(name)):
                held.append((obj, key, obj.pop(key)))

    def restore():
        for obj, key, value in held:
            obj[key] = value
    return restore


def _item_label(where, n, item):
    if where == "new":
        return f'new[{n}] {item.get("key")}'
    entry = item.get("entry") if isinstance(item.get("entry"), dict) else {}
    return f"decisions[{n}] " + (item.get("skeleton")
                                 or f'{entry.get("kind")}/{entry.get("key")}')


def _probe(doc, where, n, item, label):
    """Rows A3–A25's schema half for one item alone, so a failure names only it."""
    probe = {"schema_version": 1, "unit": doc["unit"], "attempt": doc["attempt"],
             "decisions": [], "new": []}
    probe[where] = [item]
    try:
        validate("facts-unit.schema.json", probe)
    except ValueError as exc:
        return [refuse(label, re.sub(rf"^{where}\[(?:0|N)\](?:\.|: )?", "", line)
                       .replace(f"{where}[0]", f"{where}[{n}]"))
                for line in str(exc).splitlines()[1:]]
    return []


def _sever(item, label, known):
    """A19/A20 — an `S-` ref naming no candidate of the run. A link the entry can
    live without is cut (nulled, or removed from its list) with a note; the
    required ones — a binding's `record`, a note's last `about` — refuse."""
    out = []

    def dangling(value):
        return isinstance(value, dict) and isinstance(value.get("ref"), str) \
            and value["ref"].startswith("S-") and value["ref"] not in known

    def cut(ref, where):
        out.append(note(label, f"{where}: ref {ref} names no candidate; link cut",
                        fa=FA_SEVERED))

    def walk(value, path):
        if isinstance(value, dict):
            for key, member in list(value.items()):
                where = f"{path}.{key}" if path else key
                if dangling(member) and key == "record" and ".applies_to[" in f".{path}":
                    out.append(refuse(label, f'{where}: ref {member["ref"]} names no '
                                             "candidate"))
                elif dangling(member):
                    cut(member["ref"], where)
                    value[key] = None
                else:
                    walk(member, where)
        elif isinstance(value, list):
            gone = [i for i, member in enumerate(value) if dangling(member)]
            if gone and len(gone) == len(value) and path.endswith("about"):
                out.append(refuse(label, f"{path}: every ref names no candidate"))
                return
            for i in gone:
                cut(value[i]["ref"], f"{path}[{i}]")
            for i in reversed(gone):
                del value[i]
            for i, member in enumerate(value):
                walk(member, f"{path}[{i}]")
    walk(item, "")
    return out


def _judge_doc(root, run_dir, path, doc, semantics=True):
    """`(doc, findings, unshaped)` — rows A3–A28 over a parsed document, in
    place. `doc` is None when a finding refuses the whole of it; otherwise it is
    the repaired document, a duplicate decision (A16) replaced by None so every
    index still names what the writer wrote. `unshaped` is the `(where, n)` of
    every item the schema refused: nothing can be built from those, while an
    item refused for its content still is, so one attempt hears everything."""
    name = path.name
    if not isinstance(doc, dict):
        return None, [refuse(name, "is not a JSON object")], set()
    if path.parent.parent.name == "units" and doc.get("unit") != "review":
        doc["unit"] = path.parent.name                              # A4
    elif path.parent.name == "review":
        doc["unit"] = "review"
    attempt = re.fullmatch(r"out\.([0-9]+)\.json", name)
    if attempt:
        doc["attempt"] = int(attempt.group(1))
    elif type(doc.get("attempt")) is not int or doc["attempt"] < 1:
        doc["attempt"] = 1
    if not isinstance(doc.get("unit"), str) or not doc["unit"]:
        return None, [refuse(name, "names no unit")], set()
    if doc.get("schema_version") != 1:                              # A3
        return None, [refuse(name, f'schema_version {doc.get("schema_version")!r} '
                                   "is not 1")], set()
    for where in ("decisions", "new"):                              # A5
        doc.setdefault(where, [])
        if not isinstance(doc[where], list):
            return None, [refuse(name, f"{where} is not a list")], set()
    for key in sorted(set(doc) - _allowed("root")):
        doc.pop(key)
    skeleton = read_json(pathlib.Path(run_dir) / "skeleton.json")
    candidates = {c["id"]: c for c in skeleton["candidates"]}
    nodes = process_index(root, skeleton["department"])
    plan = read_json(pathlib.Path(run_dir) / "plan.json")
    unit = next((u for u in plan.get("units") or []
                 if u.get("id") == doc["unit"]), None)
    ctx = {"candidates": candidates, "department": skeleton["department"],
           # INV-3 — the meeting passages this unit was shown, as `build`
           # recorded them: the only talk it may cite, never a path or a line
           # range it invented. A unit the plan does not name was shown none.
           "talk": _shown(unit),
           # …and the same for files: the paths `build` printed to this unit,
           # which are the only ones a `from` citation may name.
           "inputs": {ref.partition("#")[0]
                      for ref in (unit or {}).get("inputs") or []},
           "kinds": {cid: KIND_OF.get(c["kind"], c["kind"])
                     for cid, c in candidates.items()},
           "node_ids": {f'{n["process"]}::{n["node"]}' for n in nodes}
           | {f'{n["process"]}::{n["node"].rsplit("-", 1)[-1]}' for n in nodes}}
    found, passed, unshaped = [], [], set()
    for where in ("decisions", "new"):
        for n, item in enumerate(doc[where]):
            if not isinstance(item, dict):
                found.append(refuse(f"{where}[{n}]", "is not an object"))
                unshaped.add((where, n))
                continue
            # Held over the A7 drop `_repair` does and over the schema probe,
            # which sees the contract's own closed vocabulary: what comes back
            # is the engine's account, not the unit's copy of one.
            accounts = _unit_accounts(item, ctx["talk"])
            voices = _unit_voices(item, ctx["talk"])
            froms = _unit_froms(item, ctx["inputs"])
            notes = _repair(item, where, ctx)
            label = _item_label(where, n, item)
            found += [note(label, m, path=p, mark=k, fa=fa) for m, p, k, fa in notes]
            restore = _lifted(item) if where == "decisions" else (lambda: None)
            probe = _probe(doc, where, n, item, label)
            restore()
            found += probe
            if probe:
                unshaped.add((where, n))
            else:
                passed.append((where, n, label))
                if accounts:
                    item["accounts"] = accounts
                if voices:
                    item["voice"] = voices
                if froms:
                    item["from"] = froms
    if semantics:
        found += _item_checks(root, doc, passed, ctx, skeleton)
    return doc, found, unshaped


def _item_checks(root, doc, passed, ctx, skeleton):
    """A15, A16, A19/A20, A22, A26, A27 and the lint (A28) over the items the
    schema admitted."""
    kinds, known = ctx["kinds"], set(ctx["kinds"])
    symbols = skeleton.get("unit_symbols") or []
    conventions = load_conventions(root)
    decided = {d["skeleton"]: d for d in doc["decisions"]
               if isinstance(d, dict) and d.get("skeleton")}
    found, first = [], {}
    for where, n, label in passed:
        item = doc[where][n]
        skid = item.get("skeleton")
        if where == "decisions" and doc["unit"] != "review":
            if not skid:
                found.append(refuse(label, "addresses no candidate of this unit"))
                continue
            if skid not in known:
                found.append(refuse(label, f"{skid} is not a candidate of this run"))
                continue
            if skid in first:                                       # A16
                held = doc["decisions"][first[skid][0]]
                if item != held:
                    found.append(note(first[skid][1], f"{skid} is decided twice; "
                                      f"decisions[{n}] set aside: "
                                      f"{json.dumps(item, ensure_ascii=False)[:300]}",
                                      fa=FA_TWICE))
                doc["decisions"][n] = None
                continue
            first[skid] = (n, label)
        into = item.get("into")
        if item.get("action") == "merge_into" and isinstance(into, str) \
                and skid in kinds and into in kinds and kinds[skid] != kinds[into]:
            found.append(refuse(label, f"merge_into: a {kinds[skid]} cannot merge "
                                       f"into a {kinds[into]} ({into}) and has no "
                                       "key and title to stand on its own"))
            continue
        found += _sever(item, label, known)
        for message, input_key in _swapped_inputs(item, candidates=ctx["candidates"],
                                                  decided=decided):   # A26
            found += [note(label, message, path=f"data/inputs/{input_key}",
                           mark="inferred"),
                      note(label, message, fa=FA_SWAPPED)]
        for holder in [item] + [p for p in (into if isinstance(into, list) else [])
                                if isinstance(p, dict)]:
            for field in _members(holder.get("data") or {}, "fields"):   # A27
                kind = _plain(field.get("type"))
                if _plain(field.get("unit")) and kind not in (None, "number", "integer"):
                    found.append(note(label, f'field {field.get("key")} is {kind} '
                                             "and carries a unit",
                                      path=f'data/fields/{field.get("key")}/unit',
                                      fa=FA_UNIT_ON_TEXT))
        kind = kinds.get(skid) or (item.get("entry") or {}).get("kind") \
            if where == "decisions" else item.get("kind")
        found += _labelled(label, _lint_decision(item, label, symbols, kind,
                                                 conventions))
    return found


def _judge(root, run_dir, path):
    """`(doc, findings)` for one document on disk: `validate_unit`'s body, and
    the document `_outputs` folds (None when nothing in it can be)."""
    root, run_dir, path = pathlib.Path(root), pathlib.Path(run_dir), pathlib.Path(path)
    # §3.5 — two attempts per unit is a rule of the engine (A1, section 9).
    attempt = re.fullmatch(r"out\.([0-9]+)\.json", path.name)
    if attempt and int(attempt.group(1)) > ATTEMPTS:
        return None, [refuse(path.name, "attempt cap: two per run")]
    try:
        doc = read_json(path)
    except (OSError, ValueError) as exc:                            # A2
        return None, [refuse(path.name, f"not readable as JSON ({exc})")]
    doc, found, unshaped = _judge_doc(root, run_dir, path, doc)
    if doc is None:
        return None, found
    plan = read_json(run_dir / "plan.json")
    in_units = path.parent.parent.name == "units"
    working = _without(doc, unshaped)
    if doc["unit"] == "review":
        if in_units:                                                # A18
            found.append(refuse(path.name, "is a review document, but it sits in "
                                f"units/{path.parent.name}/, whose candidates it "
                                "decides none of"))
        elif (run_dir / "review" / "input.sha256").is_file():
            # The review's gate is the fold's own judgement (I1 for the
            # reviewer): what `assemble` would hold back is named here while
            # the reviewer still has an attempt. Without a digest stamp the
            # fold reads no review, so there is nothing to judge it against.
            _run, skel, st = _prepare(root, run_dir, False)
            draft = _build_entries(root, skel, st)
            _cross_unit(root, draft, st)
            review_lines = tiers.coerce(_review_problems(run_dir, working, st,
                                                         draft, st))
            found += review_lines
            if not tiers.refusals(found):
                try:
                    _r2, skel2, st2 = _prepare(root, run_dir, True)
                except SystemExit:
                    st2 = {}                # a stale digest, already said
                if st2.get("review_status") in ("applied", "partial"):
                    folded = _build_entries(root, skel2, st2)
                    _cross_unit(root, folded, st2)
                    _settle(folded, st2)
                    found += [f for f in _lint_entries(
                        root, folded, skel2.get("unit_symbols") or [],
                        st2.get("reviewed") or ())[0]
                        if f.label.startswith("review: ")]
        return doc, list(dict.fromkeys(found))
    # A document belongs to the unit whose directory it sits in (A4, A18).
    unit = next((u for u in plan["units"] if u["id"] == path.parent.name), None) \
        if in_units else None
    if not in_units:
        found.append(refuse(path.name, "is in no units/<unit id>/ directory of the "
                                       "run, so no plan entry says what it must decide"))
    elif unit is None:
        found.append(refuse(path.name, f"{path.parent.name} is no unit of this run's plan"))
    else:
        # A17 — a candidate this attempt and no earlier one decided waits; it is
        # a note, and joins a retry the unit owes anyway (section 9).
        seen = {d.get("skeleton") for d in doc["decisions"] if isinstance(d, dict)} \
            | _earlier_decided(root, run_dir, path)
        found += [note(cid, "has no decision") for cid in unit["candidates"]
                  if cid not in seen]
    # I1 (§3.1) — the output side closes here: what the unit wrote, held to the
    # contract `merge facts apply` enforces, over the items still standing.
    found += _gate(root, run_dir, working)
    return doc, list(dict.fromkeys(found))


def _whole(found):
    """A refusal no item owns — it costs the whole document."""
    return any(tiers.item_of(f) is None for f in tiers.refusals(found))


def _without(doc, gone):
    """The document with the items `gone` names emptied to None, indices kept."""
    return dict(doc, **{where: [None if (where, n) in gone else item
                                for n, item in enumerate(doc[where])]
                        for where in ("decisions", "new")})


def _without_refused(doc, found):
    """The document with every refused item emptied — what the fold reads."""
    return _without(doc, {tiers.item_of(f) for f in tiers.refusals(found)})


def _earlier_decided(root, run_dir, path):
    """A17 — the candidates an earlier attempt of this unit decided and its gate
    admitted: a retry answers only what those left."""
    attempt = re.fullmatch(r"out\.([0-9]+)\.json", path.name)
    out = set()
    for k in range(1, int(attempt.group(1)) if attempt else 1):
        earlier = path.with_name(f"out.{k}.json")
        if not earlier.is_file():
            continue
        doc, found = _judge(root, run_dir, earlier)
        if doc is None or _whole(found):
            continue
        out |= {d["skeleton"] for d in _without_refused(doc, found)["decisions"]
                if isinstance(d, dict) and d.get("skeleton")}
    return out


def _gate(root, run_dir, doc):
    """§3.1 steps 2–3 over the materialised entries, under the labels the unit's
    other findings already use."""
    skeleton = read_json(pathlib.Path(run_dir) / "skeleton.json")
    entries = materialise(root, run_dir, doc)
    labels = _unit_labels(doc)
    named = [labels.get(e["_skeleton"], e["_skeleton"]) for e in entries]
    return _contract_problems(root, entries, named,
                              skeleton.get("unit_symbols") or [])


def _contract_problems(root, entries, named, symbols):
    """The whole per-entry contract `merge facts apply` enforces, over entries
    something has already materialised, one entry at a time so a refusal names
    only its own: the repair pass (`normalise_entry`), the store schema, the
    checks that live outside the content pass (a process citation, a branch code
    off the sheets manifest, a unit symbol off the run's list, a row with no
    key), then `check_document`. `named[i]` is what entry `i` is reported under
    — a decision at the unit's gate, `<unit>: <key>` at the assembly — so no
    finding ever cites the temp id the writer never saw.

    The repairs land on `entries` themselves: the assembly writes what was
    judged.
    """
    root = pathlib.Path(root)
    store = load_store(root)
    conventions = load_conventions(root)
    # QF-33/QF-40. A bare test estate has no manifest and a fresh run may have
    # no declared symbols; an empty list there means "nothing to check against",
    # never "everything is wrong".
    branches = _registered(root / "attachments" / "sheets" / "manifest.json",
                           "branches")
    public = [{k: v for k, v in e.items() if not k.startswith("_")} for e in entries]
    if symbols:
        symbols = set(symbols) | _unit_row_keys(store, public)
    per, clean = {}, []
    for entry, label in zip(entries, named):
        found = per.setdefault(label, [])
        body = {k: v for k, v in entry.items() if not k.startswith("_")}
        found += _labelled(label, normalise_entry(body, {
            "root": root, "store": store, "unit_rows": sorted(symbols or ()),
            "conventions": conventions, "label": label}))
        private = {k: v for k, v in entry.items() if k.startswith("_")}
        entry.clear()
        entry.update(body, **private)
        clean.append(body)
        try:
            validate("facts-delta.schema.json",
                     {"schema_version": 2, "entries": [body]})
        except ValueError as exc:
            # One entry was checked, so every `entries[0]` / `entries[N]` is it.
            found += [refuse(label, re.sub(r"entries\[(?:0|N)\]\.?", "", line)
                             .lstrip(": "))
                      for line in str(exc).splitlines()[1:]]
        # I3 — the citation was live when the run was planned; the tombstone may
        # have landed since (A33, the preconditions' own tier).
        found += process_findings(root, body, label)
        scope = body.get("scope") or {}
        off = [b for b in scope.get("branches") or [] if branches and b not in branches]
        if off:                                                     # A34
            scope["branches"] = [b for b in scope["branches"] if b not in off]
            found += [note(label, f"scope.branches: branch {b!r} is not in the "
                                  "sheets manifest; dropped", fa=FA_BRANCH)
                      for b in off]
        if symbols:                                                 # A35
            found += undeclared_unit_findings(body, symbols, label)
        if body.get("kind") == "record" and isinstance(body.get("data"), dict):
            _derive_row_keys(body["data"])                          # A36
            found += keyless_row_findings(body, label)
    delta = {"schema_version": 2, "entries": clean}
    # A `calls[]` ref this document could not resolve is `T-0`, so `_call_keys`
    # rescues nothing and every identifier that call declares reads as
    # undeclared. Cross-unit resolution is `_resolve_refs`' job — skip the expr
    # line here the way `_check_unit_edges` skips a target it cannot see.
    blind = {e.get("id") for e in clean
             if any(isinstance(c, dict) and c.get("ref") == "T-0"
                    for c in ((e.get("data") or {}).get("calls") or []))}
    by_temp = dict(zip((e.get("id") for e in clean), named))
    for finding in check_document(delta, "facts-delta", store,
                                  unit_symbols=symbols, conventions=conventions):
        if finding.label in blind and finding.message.startswith("expr identifier "):
            continue
        label = by_temp.get(finding.label, finding.label)
        per.setdefault(label, []).append(replace(finding, label=label))
    out = []
    # §3.4's ceiling, per entry and on refusals only: a note carries a mark the
    # entry must keep, and a refusal past the ceiling costs the same one item.
    for label, found in per.items():
        refused = tiers.refusals(found)
        out += refused[:LINE_CAP] + tiers.notes(found)
        if len(refused) > LINE_CAP:
            out.append(refuse(label, f"… and {len(refused) - LINE_CAP} more"))
    return out


def _members(data, key):
    """`data[key]`'s dict members. The payload vocabulary is open leaves, so a
    unit may write a list of bare strings where members are expected — a shape
    the lint skips rather than dies on."""
    value = data.get(key)
    return [m for m in value if isinstance(m, dict)] if isinstance(value, list) else []


def _swapped_inputs(decision, candidates, decided):
    """§3.2 — a rule input bound to a column it is not named for, as
    `[(message, input key)]` (A26: stored, marked inferred, with a note).

    A rule that runs in several tabs takes its inputs by parameter: the input
    says `from: {param: "ref_1"}` and each binding maps `ref_1` to a concrete
    `{ref, field}`. The unit sees the parameter, not the column. The first real
    run assigned them in the order it wrote its inputs: the input it called
    «موجودی آغاز شب» reads «مقدار دریافت از انبار». `a + b` came out right and
    the sentence in the store was false.

    Only the visible swap is named — an input whose key IS another column of
    the record it reads. A key named for the concept rather than the column is
    no evidence of anything, and neither is a record whose decision sits in
    another unit: its minted keys are not in this document, so its columns are
    still the skeleton's `c_<letter>` and no input key can collide with one.
    """
    data = decision.get("data") if isinstance(decision.get("data"), dict) else {}
    payload = (candidates.get(decision.get("skeleton")) or {}).get("payload") or {}
    bindings = data.get("applies_to") or payload.get("applies_to") or []
    params = (bindings[0].get("params") or {}) if isinstance(bindings, list) \
        and bindings and isinstance(bindings[0], dict) else {}
    out = []
    for n, given in enumerate(data.get("inputs") if isinstance(data.get("inputs"), list)
                              else []):
        source = given.get("from") if isinstance(given, dict) else None
        bound = params.get(source.get("param")) if isinstance(source, dict) else None
        record = candidates.get(bound.get("ref")) if isinstance(bound, dict) else None
        if record is None or not bound.get("field"):
            continue
        # The record's own decision is what mints its keys — the same merge
        # `_rename_fields` does at step 1b, over the one document in hand.
        renames = {f["from"]: f["key"] for f in
                   _members((decided.get(bound["ref"]) or {}).get("data") or {}, "fields")
                   if f.get("from") and f.get("key")}
        columns = {renames.get(f["key"], f["key"])
                   for f in _members(record.get("payload") or {}, "fields")}
        reads = renames.get(bound["field"], bound["field"])
        if given.get("key") in columns and given.get("key") != reads:
            out.append((f'data.inputs[{n}]: key {given["key"]} is bound through '
                        f'{source["param"]} to column {reads}', given["key"]))
    return out


def _lint_decision(decision, label, symbols, kind=None,
                   conventions=DEFAULT_CONVENTIONS):
    """§5.2 at unit level (QF-50) — the unit that wrote a failing sentence is
    the one told, which is only true while the decision is still addressable by
    its own index.

    `kind` is the store kind the decision lands as, and it decides one rule:
    «ستون»/«تب»/«سلول» belong in a **record's** own `statement`, which is what
    `content._check_prose` allows at Stage V and what the style card and the
    unit's own card ask for. A title is strict whatever the kind.

    It IS `content._check_prose`, read over the decision as the entry it
    becomes (A28 — the content pass's tier, not this gate's).
    """
    out = []
    parts = decision.get("into") if decision.get("action") == "split" else [decision]
    for part in parts or []:
        if not isinstance(part, dict):
            continue
        data = part.get("data") if isinstance(part.get("data"), dict) else {}
        _check_prose({**part, "kind": kind,
                      # A decision carries its issues under `data`; an assembled
                      # entry carries them at the top, where `_check_prose` looks.
                      "issues": part.get("issues") or data.get("issues") or []},
                     symbols, out, label, conventions)
    return out


# --------------------------------------------------------------------------
# T15 step 0 (§2.6): the units' documents, the review folded onto them, and
# the two shapes every later step reads — the `(kind, key, scope)` address and
# the `{value, inferred}` wrapper the model writes on a leaf.

#: A candidate's kind as the store spells it — a `.gs` script is a rule; a
#: `new[]` entry already names a store kind, so it passes through.
KIND_OF = {"record": "record", "rule": "rule", "script": "rule",
           "gs": "rule"}
_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")

#: A dispute's sides, lettered — the owner answers «۱ الف» (§2.7), so
#: `gate-b.md` and `report.md` letter one list the same way.
LETTERS_FA = ("الف", "ب", "ج", "د")

#: §2.3's two attempts per unit — a unit that has used both is `failed`, and
#: its candidates go to `undecided[]` rather than blocking the assembly.
ATTEMPTS = 2

#: The ceiling on the reviewer's input: the runtime model holds 1 M tokens and
#: cooking, the largest department, digests to ~29 K. Above it the run stops —
#: the assembled result would have to be reviewed in slices, which this engine
#: cannot do, and skipping the review instead was silently dropping it (R7).
DIGEST_CEILING = 400000

#: The reason codes of §2.5 in the owner's words (§2.7) — `gate-b.md` names the
#: commonest, `report` renders the whole list. Past tense: both files are read
#: after the run, and the owner is being told what happened, not what happens.
REASON_FA = {"not_a_fact": "واقعیت کمّی نبود",
             "date_passthrough": "فقط تاریخ را منتقل می‌کرد",
             "cosmetic": "ظاهری بود (رنگ و قالب)",
             "duplicate": "تکراری بود",
             "has_a_home": "جای دیگری ثبت شد",
             "insufficient_context": "اطلاعات کافی نبود",
             "other": "دلایل دیگر"}

#: Every issue kind `build` can raise (§2.3), grouped for the owner. `report`
#: prints the kind's words once and the engine's own Persian descriptions
#: beneath it — the description names the sheet, never a path or an id.
#: The three judgement columns of Gate M (§2.2), in the words the playbook's
#: own Gate M block puts to the owner — never the enum string.
UNRESOLVED_FA = {"departments": "دپارتمان", "branches": "شعبه",
                 "reference_tabs": "برگه‌های مرجع"}

ISSUE_FA = {"cross_record": "فهرست مقادیر مجاز بین نسخه‌ها یکی نیست",
            "column_shift": "ستون جاافتاده در جدول کپی‌شده",
            "leading_offset": "جابه‌جایی ستون‌های تاریخ",
            "unknown_source": "منبع ناشناخته",
            "unused_mirror": "کپی بدون استفاده",
            "broken_formula": "فرمول خراب",
            "cached_error": "خطای ذخیره‌شده در فایل",
            "no_rule_applies": "خانهٔ بدون قاعده",
            "hand_maintained_index": "فهرست دستی",
            "per_cell_mirror": "کپی خانه‌به‌خانه",
            "column_offset": "اختلاف ستون بین نسخه‌ها",
            "ambiguous_row_header": "عنوان تکراری در سطر",
            "unheaded_formula": "فرمول بدون عنوان ستون",
            "row_labels_ambiguous": "برچسب سطرها قابل تشخیص نبود",
            "row_labels_partial": "برچسب سطرها ناقص بود",
            "reference_tab_is_mirror": "تب مرجع در واقع کپی بود",
            "reference_tab_is_ids": "تب مرجع در واقع فهرست شناسه‌ها بود",
            "reference_tab_computes": "تب مرجع فرمول دارد",
            "unread_attachment": "فایلی که خوانده نشد",
            # No «کنار گذاشته شد» here: an over-budget attachment unit is still
            # dispatched and read, so the block heading states only the size —
            # the parent heading of `report.md` carries the "not reviewed".
            "oversized": "بزرگ‌تر از یک واحد"}

#: §3.2 — every `undecided[]` member carries a `reason`, and the owner reads one
#: fixed line per reason. A run no longer stops for one input, so this list IS
#: how the owner learns why something is missing; a reason with no line here
#: would come out blank.
UNDECIDED_FA = {"oversized": ISSUE_FA["oversized"],
                "cycle": "به هم ارجاع می‌دادند و هیچ‌کدام مقصد نبود",
                "target_dropped": "موردی که در آن ادغام می‌شد ثبت نشد",
                "unknown_ref": "به موردی ارجاع می‌داد که در سامانه نیست",
                "refused": "با قرارداد ثبت جور در نیامد",
                "not_decided": "در این اجرا درباره‌اش تصمیمی گرفته نشد",
                "waits": "منتظر بخشی است که در این اجرا تمام نشد",
                "failed": "در این اجرا بررسی نشد"}

#: R1 — why one review decision was held back, in the owner's words (§2.7).
#: `report` renders these under the review's own closing line; every code here
#: is one `_review_verdicts` or the fold loop can put on a `review_held[]` row,
#: and a code with no line here would come out blank.
REVIEW_HELD_FA = {
    "no_match": "نشانی به هیچ موردی نمی‌رسید",
    "ambiguous": "نشانی به بیش از یک مورد می‌رسید",
    "no_drift": "تناقض روی میدانی بود که پرچم اختلاف نداشت",
    "unknown_skeleton": "نامزدی که نام برده شد در این اجرا نبود",
    "fields_rewrite": "بازنویسی ستون‌های جدول از بازبینی پذیرفته نمی‌شود",
    "refused": "نتیجهٔ بازنویسی با قرارداد ثبت جور در نیامد",
}

#: §2.6 step 7's `wrapper_variants`: a variant that only converts or totals the
#: reading beneath it is the same rule, not a second one.
#: ponytail: these three names and the `CONVERT_` family are what the estate
#: spells today; widen the tuple when a run meets a wrapper it does not know.
WRAPPERS = ("SUM", "ROUND", "IFERROR")


def _fa(value):
    """Latin digits to Persian — every number in an owner-facing file (§2.7)."""
    return str(value).translate(_DIGITS)


def _account(field, side):
    """One side of a disagreement, in the shape §2.6 gives an open account: no
    `id` — `apply` mints those — and the value in the owner's digits. Step 7
    writes two of these for a cross-source disagreement, and the reviewer's
    `account` resolution (step 0) writes the same two off the same record."""
    return {"field": field, "value": side["value"], "status": "open",
            "speaker_role": None,
            "statement": "مقدار ثبت‌شده برای این خانه: " + _fa(side["value"]),
            "source": side["source"]}


def _shown(unit):
    """Every stretch of meeting this unit was handed, as `{rel, first, last}`:
    the passages `build` recorded on it (`talk`, a phase-1 form unit) **and**
    its own transcript inputs (a phase-2 unit reads one excerpt whole, and
    `#L<first>-L<last>` is exactly that bound — spec §3 phase 2 lets it write
    an account against a listed value, and the talk it heard is its own input).

    Without the second half a transcript unit's every account was dropped in
    silence, including one citing the very lines it was reading.
    """
    out = [dict(p) for p in (unit or {}).get("talk") or []]
    for ref in (unit or {}).get("inputs") or []:
        rel, _, span = ref.partition("#")
        bounds = re.fullmatch(r"L([0-9]+)-L([0-9]+)", span)
        if bounds and rel.startswith(TRANSCRIPT_DIR) and rel.endswith(TRANSCRIPT_EXT):
            out.append({"rel": rel, "first": int(bounds.group(1)),
                        "last": int(bounds.group(2))})
    return out


def _cited(src, passages):
    """A citation to talk this unit was actually handed: a `voice` source whose
    lines lie inside one of the stretches `_shown` lists for it (spec §3,
    INV-3 at passage level).

    `ref in plan["hashes"]` was not enough. The engine selects and the unit
    never searches, so a citation to a chosen transcript the unit was shown no
    line of is a line range nobody read — and it reaches the owner looking
    exactly as checkable as a real one. The passages are the planner's own
    record of what it printed, so this asks the one question that matters.
    """
    if not (isinstance(src, dict) and src.get("type") == "voice"):
        return False
    # The store schema's own `sourceLoc.lines`: a single line is a range too.
    span = re.fullmatch(r"([0-9]+)(?:-([0-9]+))?", str(src.get("lines")))
    if not span:
        return False
    first, last = int(span.group(1)), int(span.group(2) or span.group(1))
    return first <= last and any(
        p.get("rel") == src.get("ref")
        and p.get("first") <= first and last <= p.get("last")
        for p in passages)


def _unit_accounts(node, passages):
    """Spec 2026-09-15: a unit may write an account only for what it heard — a
    scalar with a `voice` source citing a passage it was shown (`_cited`).
    Anything else is dropped as A7 drops every engine-owned member (REPAIR, no
    note).

    The kept members come out in the shape the store contract speaks (`field`,
    `statement`), which is the one `_cross_unit` already writes: the unit
    spells the QF-7 leaf `path`, because that is what §2.5 calls it everywhere
    else a unit writes one.
    """
    out = []
    for account in node.get("accounts") or []:
        if (isinstance(account, dict)
                and _cited(account.get("source"), passages)
                and isinstance(account.get("path"), str)
                and account.get("value") is not None
                and not isinstance(account["value"], (dict, list))):
            out.append(_account(account["path"], account))
    return out


def _unit_voices(node, passages):
    """Spec §3 phase 1: what the talk filled in that the form does not state is
    cited as the meeting. One `voice[]` member per passage used, gated by the
    same predicate the accounts are — `_entry` appends them to `source[]`
    beside the sheet, never instead of it."""
    return [{"type": "voice", "ref": v["ref"], "lines": v["lines"]}
            for v in node.get("voice") or []
            if isinstance(v, dict) and _cited(dict(v, type="voice"), passages)]


def _unit_froms(node, inputs):
    """Task G 2026-09-16: which of the files it was handed an entry was read
    off, gated the way the talk citations are — a path `build` did not print to
    this unit is dropped in silence (REPAIR, no note, INV-3 at file level).

    A unit reading one photo needs none of this; one reading fourteen was
    citing all fourteen on every entry, which is a citation nobody can check.
    """
    return [rel for rel in node.get("from") or []
            if isinstance(rel, str) and rel in inputs]


def _address(entry):
    """`(kind, key, canonical scope)` — how the review addresses an assembled
    entry, and how two units are found to have minted the same one (§2.6)."""
    return (entry["kind"], entry["key"],
            json.dumps(canonical_scope(entry.get("scope")), sort_keys=True))


def _outputs(root, run_dir, plan):
    """`[(unit, path, doc)]` for the units that returned something usable, in
    ascending unit id — the only order `assemble` has, and the reason it is
    deterministic.

    F3/A42: a document is folded with only its refused items taken out, and a
    retry is folded over the attempt before it (`_overlay`). A unit is left out
    — `failed`, its candidates to `undecided[]` — only when no attempt of it can
    be read as a document. One with nothing readable and an attempt still owed
    is refused here, naming the unit: QF-51 checks a document the moment it
    returns, and one nobody has fixed since must not be skipped in silence.
    """
    out, problems = [], []
    for unit in sorted(plan["units"], key=lambda u: u["id"]):
        attempts = sorted((run_dir / "units" / unit["id"]).glob("out.*.json"))
        merged, whole = None, []
        for path in attempts:
            doc, found = _judge(root, run_dir, path)
            whole = [f.line() for f in tiers.refusals(found)
                     if tiers.item_of(f) is None]
            if doc is not None and not whole:
                merged = _overlay(merged, _folded(doc, found), unit["id"])
        if merged is not None:
            out.append((unit, attempts[-1], merged))
        elif attempts and len(attempts) < ATTEMPTS:
            problems += [f'{unit["id"]}: {message}' for message in whole]
    if problems:
        for line in problems:
            print(f"facts-plan: {line}", file=sys.stderr)
        raise SystemExit(2)
    return out


def _folded(doc, found):
    """F3 — one attempt as `_collect` reads it: its refused decisions gone (their
    lines kept by candidate), a refused `new[]` entry's slot emptied so every
    later `N-` handle keeps its index, and each item carrying its own notes."""
    refused, noted = {}, {}
    for finding in found:
        item = tiers.item_of(finding)
        if item is not None:
            (refused if finding.tier == tiers.REFUSE else noted) \
                .setdefault(item, []).append(finding)
    out = {"decisions": [], "new": [], "refused": {}, "refused_new": {}}
    for n, decision in enumerate(doc["decisions"]):
        if not isinstance(decision, dict):
            continue
        if ("decisions", n) in refused:
            if decision.get("skeleton"):
                out["refused"][decision["skeleton"]] = \
                    [f.line() for f in refused[("decisions", n)]]
            continue
        out["decisions"].append(dict(decision, _notes=noted.get(("decisions", n), [])))
    for n, entry in enumerate(doc["new"]):
        if isinstance(entry, dict) and ("new", n) in refused:
            out["refused_new"][n] = {
                "kind": entry.get("kind"), "key": entry.get("key"),
                "title": entry.get("title"),
                "lines": [f.line() for f in refused[("new", n)]]}
        out["new"].append(dict(entry, _notes=noted.get(("new", n), []))
                          if isinstance(entry, dict) and ("new", n) not in refused
                          else None)
    return out


def _overlay(first, later, unit):
    """A42 — a retry answers what an earlier attempt refused: its decisions
    replace the earlier ones by candidate, its `new[]` entries by `(kind, key)`,
    and each `N-<unit>-<n>` handle it wrote is renumbered to the slot its entry
    takes. What the earlier attempt accepted and the retry refuses stays."""
    if first is None:
        return later
    out, later = copy.deepcopy(first), copy.deepcopy(later)
    def slot(row):
        return json.dumps([row.get("kind"), row.get("key")], ensure_ascii=False)
    slots = {slot(r): n for n, r in out["refused_new"].items()}
    slots.update({slot(e): n for n, e in enumerate(out["new"]) if isinstance(e, dict)})
    renumber = {}
    rows = {m: dict(row, entry=None) for m, row in later["refused_new"].items()}
    rows.update({m: {"kind": e.get("kind"), "key": e.get("key"), "entry": e}
                 for m, e in enumerate(later["new"]) if isinstance(e, dict)})
    for m, row in sorted(rows.items()):
        n = slots.get(slot(row))
        if n is None:
            n = slots[slot(row)] = len(out["new"])
            out["new"].append(None)
        renumber[f"N-{unit}-{m}"] = f"N-{unit}-{n}"
        if row["entry"] is not None:
            out["new"][n] = row["entry"]
            out["refused_new"].pop(n, None)
        elif out["new"][n] is None:
            out["refused_new"][n] = {k: v for k, v in row.items() if k != "entry"}
    for item in later["decisions"] + [e for e in later["new"] if isinstance(e, dict)]:
        for ref in _refs(item):
            if ref.get("ref") in renumber:
                ref["ref"] = renumber[ref["ref"]]
    at = {d.get("skeleton"): i for i, d in enumerate(out["decisions"])}
    for decision in later["decisions"]:
        skid = decision.get("skeleton")
        if skid in at:
            out["decisions"][at[skid]] = decision
        else:
            at[skid] = len(out["decisions"])
            out["decisions"].append(decision)
        out["refused"].pop(skid, None)
    for skid, lines in later["refused"].items():
        if skid not in at:
            out["refused"][skid] = lines
    return out


def _pseudo(entry, unit, n):
    """A `new[]` entry as a candidate and its own `keep` (§2.6 step 6).

    Step 6 used to build these entries on a side path of its own, which left
    them unaddressable: the review resolves an `entry: {kind, key, scope}` to
    the entry's skeleton id, and an entry that had none took every review
    decision aimed at it into a bucket nothing read — a `drop` on a note came
    back `applied` with the note still in the delta. With a handle of its own a
    `new` entry is decided, merged, split, dropped and reinstated by exactly
    the code that does it for a candidate.
    """
    handle = f"N-{unit}-{n}"
    candidate = {"id": handle, "kind": entry["kind"], "unit": unit,
                 # The unit's `data` is this candidate's mechanical payload, so
                 # a review `keep` carrying `data` merges over it the same way
                 # a unit's decision merges over a skeleton's.
                 "payload": copy.deepcopy(entry.get("data") or {}),
                 "render": {"name": entry["title"]}}
    decision = {"action": "keep", "unit": unit, "data": {},
                **{k: v for k, v in entry.items()
                   # `voice` and `from` are the entry's citations, gated in
                   # `_judge_doc` and read by `_entry` off the decision: a
                   # member left off this list is gated and then silently lost.
                   if k in ("key", "title", "statement", "aliases", "branches",
                            "home", "processes", "accounts", "voice", "from",
                            "extra", "_notes")}}
    return handle, candidate, decision


def _collect(root, run_dir, plan, skeleton):
    """The units' decisions keyed by skeleton id, their `new[]` entries as
    candidates of their own, what their gates refused, and the units that
    returned nothing usable."""
    state = {"by_skeleton": {}, "new": [], "failed": set(),
             "review_status": "absent", "dropped": [], "undecided": [],
             # Both halves of R1, seeded here so a run assembled without
             # `--review` writes `review_held: []` rather than nothing, and the
             # fold loop may read `reviewed_by` before any review is folded.
             "review_held": [], "reviewed_by": {},
             "provenance": {}, "flags": [], "refused": {}, "refused_new": []}
    returned = set()
    for unit, _path, doc in _outputs(root, run_dir, plan):
        returned.add(unit["id"])
        for decision in doc["decisions"]:
            state["by_skeleton"][decision["skeleton"]] = dict(decision,
                                                              unit=unit["id"])
        for n, entry in enumerate(doc["new"]):
            if entry is None:
                continue
            handle, candidate, decision = _pseudo(entry, unit["id"], n)
            state["new"].append(candidate)
            state["by_skeleton"][handle] = decision
        state["refused"].update(doc["refused"])
        state["refused_new"] += [dict(row, unit=unit["id"])
                                 for _n, row in sorted(doc["refused_new"].items())]
    state["failed"] = {u["id"] for u in plan["units"] if u["id"] not in returned}
    return state


def _review_hits(draft):
    """`hits(ref) -> [entry]` for an `entryAddr`. `scope` is optional there:
    without it, kind + key is the address, and it has to name exactly one
    assembled entry across every scope."""
    address = {}
    for entry in draft:
        address.setdefault(_address(entry), []).append(entry)

    def hits(ref):
        if ref.get("scope") is not None:
            return address.get(_address(ref), [])
        return [e for a, es in address.items() for e in es
                if a[:2] == (ref["kind"], ref["key"])]
    return hits


def _review_verdicts(run_dir, doc, state, draft, scratch):
    """`(stale, {index: (reason code, line)})` — R1's judgement of this review,
    one verdict per decision. The review's gate (`validate facts-unit
    review/out.json`) and `_fold_review` judge by this one function, so what the
    gate admits the fold applies and what it names the fold holds back.

    The flags are the ones `scratch` carries, which are the ones
    `review/input.md` was rendered from — a field none of them names is an
    address the reviewer invented (QF-52).
    """
    stamp = run_dir / "review" / "input.sha256"
    text = _digest_text(scratch, draft)
    stale = stamp.read_text(encoding="utf-8").strip() != \
        hashlib.sha256(text.encode("utf-8")).hexdigest()
    hits = _review_hits(draft)
    assembled = {entry["_skeleton"] for entry in draft}
    held = {}

    def name(ref):
        return f'{ref["kind"]} {ref["key"]}'
    for n, decision in enumerate(doc["decisions"]):
        label = f"decisions[{n}]"
        if not isinstance(decision, dict):
            continue                    # refused by the item gate (A41)
        if decision.get("action") == "contradiction":
            named = {_address(e) for e in hits(decision["entry"])} \
                if decision.get("entry") else set()
            # `field` is optional in the schema for a `contradiction`, and a
            # document that leaves it out is admitted — so it is answered here,
            # where a missing field simply names no flag, and not with a
            # `KeyError` over the reviewer's second attempt (R8).
            if not any(f["code"] == "unit_drift"
                       and f["field"] == decision.get("field")
                       and _address(f["entry"]) in named
                       for f in scratch["flags"]):
                held[n] = ("no_drift",
                           f'{label}: contradiction: no drift flag on '
                           f'{decision.get("field")} for {name(decision["entry"])}')
            continue
        into = decision.get("into")
        if isinstance(into, dict):
            k = len(hits(into))
            if k != 1:
                held[n] = ("no_match" if k == 0 else "ambiguous",
                           f'{label}: into: {name(into)} names '
                           f"{k} assembled entries")
                continue
        # `into` may also be a bare skeleton id (`facts-unit.schema.json` admits
        # both). One naming a candidate this run did not keep is folded happily
        # and then dies in `_build_entries` as `target_dropped` — blamed on the
        # unit that wrote the *source*, which decided nothing of the sort.
        elif isinstance(into, str) and decision.get("action") == "merge_into" \
                and into not in assembled:
            held[n] = ("unknown_skeleton",
                       f"{label}: into: skeleton {into} is no assembled entry "
                       "of this run")
            continue
        if decision.get("skeleton"):
            if decision["skeleton"] not in state["by_skeleton"]:
                held[n] = ("unknown_skeleton",
                           f'{label}: skeleton {decision["skeleton"]} is '
                           "decided by no unit")
                continue
        else:
            k = len(hits(decision["entry"]))
            if k != 1:
                held[n] = ("no_match" if k == 0 else "ambiguous",
                           f'{label}: entry: {name(decision["entry"])} names '
                           f"{k} assembled entries")
                continue
        # R1 `fields_rewrite`: the digest lists a record's columns by the keys
        # its unit minted, never by the `c_<letter>` the shape is written over —
        # so a `fields[]` from the review is a rewrite over names it never saw.
        # The accounting review of 2026-09-09 lost its three decisions to one.
        if decision.get("action") == "keep" \
                and isinstance(decision.get("data"), dict) \
                and "fields" in decision["data"]:
            held[n] = ("fields_rewrite",
                       f"{label}: fields: a review does not rewrite a record's "
                       "fields (the digest shows minted keys, not column keys)")
    return stale, held


def _review_problems(run_dir, doc, state, draft, scratch):
    """`_review_verdicts` as the flat list of lines a gate prints."""
    stale, held = _review_verdicts(run_dir, doc, state, draft, scratch)
    return (["out.json: the digest changed since this review was written"]
            if stale else []) \
        + [line for _n, (_code, line) in sorted(held.items())]


def _held_label(decision, hits, state):
    """What the owner is told a held decision was about (R1): the title of the
    entry its address landed on, the bare `kind key` when the address landed
    nowhere or everywhere, and the candidate's own label for a `skeleton`
    address. Never an id — `review_held[]` is read out in `report.md`."""
    if not isinstance(decision, dict):
        return "—"
    for key in ("entry", "into"):
        ref = decision.get(key)
        # Guarded, because a document the schema refused reaches here too: an
        # address missing its halves is skipped rather than raising, and an
        # entry whose title is empty still reads as something.
        if not isinstance(ref, dict) or not isinstance(ref.get("kind"), str) \
                or not isinstance(ref.get("key"), str):
            continue
        found = hits(ref) if isinstance(ref.get("scope"), (dict, type(None))) \
            else []
        return (found[0]["title"] if len(found) == 1
                else f'{ref["kind"]} {ref["key"]}') or "—"
    candidate = (state.get("candidates") or {}).get(decision.get("skeleton"))
    return (label_of(candidate) if candidate else decision.get("title")) or "—"


def _touched(decision):
    """The skeletons a folded review decision changes: its own, and for a
    `merge_into` the target as well. The source is absorbed away and leaves no
    entry, so a merge that makes its target unstorable is the review's to
    answer for — the unit that wrote the target changed nothing (R2).

    A `contradiction` never joins `folded` (it settles a record rather than
    deciding a candidate), so the entry it settles is registered where it is
    resolved, in the fold loop above."""
    into = decision.get("into")
    return [decision["skeleton"]] + (
        [into] if decision.get("action") == "merge_into"
        and isinstance(into, str) else [])


def _fold_review(root, run_dir, state, draft, scratch, exclude=frozenset(),
                 held=None):
    """Step 0 (§2.6), under R1: the review is never dropped. Every decision that
    passes `_review_verdicts` is folded; the ones that do not are held back one
    by one, and `exclude`/`held` carry back the ones `assemble`'s own lint
    refused a round earlier (R2). A stale digest is the one thing that stops the
    run instead (R3) — the reviewer read another assembly, so nothing it wrote
    can be trusted onto this one.

    The document is read and schema-checked *before* the stale-digest check,
    deliberately: a file that cannot be parsed or does not fit the contract is
    held back whole (R8 has already given the reviewer its two attempts), and
    only a well-formed review is judged against the digest it claims to answer.

    Returns `"absent"`, `"applied"` (nothing held) or `"partial"`."""
    path = run_dir / "review" / "out.json"
    if not path.is_file() or not (run_dir / "review" / "input.sha256").is_file():
        return "absent"
    hits = _review_hits(draft)
    doc = raw = None
    try:
        # A truncated or fenced write is the same failure class as a
        # schema-invalid one: `json.JSONDecodeError` is a `ValueError`, so one
        # `except` turns both into the whole-document hold-back below.
        doc = read_json(path)
        raw = copy.deepcopy(doc)
        # The per-item checks too (A15/A19/A20/A22): the fold holds each row
        # to the tier the review gate does — a link the gate cuts is cut here,
        # a decision it refuses is held here (principle 4).
        doc, found, _unshaped = _judge_doc(root, run_dir, path, doc)
        if doc is None:
            raise ValueError("; ".join(tiers.lines(found)))
    except (OSError, ValueError) as exc:
        # R8 routes the reviewer's second failure straight here, so this is the
        # document the fold must survive, not the one it may assume away: every
        # field `_review_verdicts` reads is optional in a refused document.
        # Nothing is dropped and nothing raises — every decision is held back
        # under the schema's own line, and `report` names them.
        decisions = raw.get("decisions") if isinstance(raw, dict) else None
        rows = [{"n": n, "action": d.get("action") if isinstance(d, dict) else None,
                 "label": _held_label(d, hits, scratch), "reason": "refused",
                 "lines": [str(exc)]}
                for n, d in enumerate(decisions if isinstance(decisions, list)
                                      else [])]
        state["review_held"] = rows or [{"n": 0, "action": None, "label": "—",
                                         "reason": "refused",
                                         "lines": [str(exc)]}]
        state["settled"], state["reviewed"], state["reviewed_by"] = [], set(), {}
        return "partial"
    # A41 — a decision the item gate refuses is held back alone, under its lines;
    # a decision's notes ride with it onto the entry it folds into.
    gate, noted = {}, {}
    for finding in found:
        where, n = tiers.item_of(finding) or (None, None)
        if where != "decisions":
            continue
        if finding.tier == tiers.REFUSE:
            gate.setdefault(n, []).append(finding.line())
        else:
            noted.setdefault(n, []).append(finding)
    doc = _without_refused(doc, found)
    stale, verdicts = _review_verdicts(run_dir, doc, state, draft, scratch)
    if stale:
        print("facts-plan: review: the digest changed since this review was "
              "written — run digest and the review again", file=sys.stderr)
        raise SystemExit(2)
    skip = set(verdicts) | set(exclude) | set(gate)
    folded, settled, reviewed_by = [], [], {}
    for n, decision in enumerate(doc["decisions"]):
        if n in skip:
            continue
        if decision.get("action") == "contradiction":
            # The fifth action, `review`-only: the reviewer settles a
            # `unit_drift` the cross-unit pass flagged — `fix` writes the leaf,
            # `account` keeps both readings open for the owner. It settles a
            # record rather than deciding a candidate, so it never joins
            # `folded`: merged onto a decision it would replace the `keep` and
            # the entry would leave the delta altogether.
            hit = hits(decision["entry"])[0]
            flag = next(f for f in scratch["flags"]
                        if f["code"] == "unit_drift"
                        and f["field"] == decision["field"]
                        and _address(f["entry"]) == _address(hit))
            # `_settle` finds the entry by its full address, so a scope the
            # reviewer left out is filled in from the entry it named.
            settled.append((flag, dict(decision, entry={
                "kind": hit["kind"], "key": hit["key"],
                "scope": hit.get("scope")})))
            reviewed_by.setdefault(hit["_skeleton"], []).append(n)
            continue
        # `into` may be an address too (`facts-unit.schema.json`'s `entryAddr`),
        # and `_target_of` walks skeleton ids — so it is resolved here, never
        # handed on as a dict nothing can follow.
        if isinstance(decision.get("into"), dict):
            decision = dict(decision,
                            into=hits(decision["into"])[0]["_skeleton"])
        if not decision.get("skeleton"):
            decision = dict(decision,
                            skeleton=hits(decision["entry"])[0]["_skeleton"])
        folded.append((n, decision))
    for n, decision in folded:
        previous = state["by_skeleton"].get(decision["skeleton"], {})
        notes = noted.get(n, [])
        if decision.get("action") == "keep" and previous.get("statement") \
                and any(f.fa == FA_NO_STATEMENT for f in notes):
            # I-1: the "" A9 wrote so the keep passes its schema is no rewrite
            # — the unit's statement stands, and there is nothing to mark.
            decision = {k: v for k, v in decision.items() if k != "statement"}
            notes = [f for f in notes if f.fa != FA_NO_STATEMENT]
        merged = {**previous, **{k: v for k, v in decision.items()
                                 if v is not None}}
        merged["_notes"] = list(previous.get("_notes") or []) + notes
        # A review `keep` carrying `data` changes the members it lists and
        # nothing else: the unit's `quantity`, `fields[]`, … stay. Replacing
        # `data` wholesale (the shape until 2026-09-09) made a reviewer's
        # one-member rewrite of sixteen entries lose the members it did not
        # name, and the whole review with it.
        if isinstance(previous.get("data"), dict) and isinstance(decision.get("data"), dict):
            merged["data"] = {**previous["data"], **decision["data"]}
        merged["unit"] = previous.get("unit", "review")
        state["by_skeleton"][decision["skeleton"]] = merged
        for skid in _touched(decision):
            reviewed_by.setdefault(skid, []).append(n)
    state["settled"] = settled
    # Whose mistake a refused entry is: the reviewer touched this one, so
    # `_lint_entries` names the review rather than the unit it came from —
    # every entry a decision changed, which is exactly what `reviewed_by`
    # collected: a `keep`'s own, a `merge_into`'s target, a settled
    # `contradiction`'s record (R2).
    state["reviewed"] = set(reviewed_by)
    # …and which of its decisions did, so R2 can hold that one back by index
    # instead of refusing the document the lint line belongs to.
    state["reviewed_by"] = reviewed_by
    rows = []
    for n in sorted(skip):
        if n in gate:
            code, lines = "refused", gate[n]
        elif n in verdicts:
            code, lines = verdicts[n][0], [verdicts[n][1]]
        else:
            code, lines = (held or {}).get(n) or ("refused", [])
        rows.append({"n": n, "action": (raw["decisions"][n] or {}).get("action")
                     if isinstance(raw["decisions"][n], dict) else None,
                     "label": _held_label(raw["decisions"][n], hits, scratch),
                     "reason": code, "lines": list(lines)})
    state["review_held"] = rows
    return "partial" if skip else "applied"


def _settle(entries, state):
    """The `contradiction`s of step 0, applied over step 7's survivors — the
    only review action that waits for the merge, because the entry it settles
    is the one the merge leaves behind.

    A settled flag leaves `state["flags"]`: a drift the reviewer has answered
    is not an open one, and everything downstream that reads the flags — the
    owner's report among them — would otherwise report it as still open.
    """
    by_address = {_address(entry): entry for entry in entries}
    for flag, decision in state.get("settled") or []:
        entry = by_address.get(_address(decision["entry"]))
        if entry is None:
            # The same review renamed what it settled — the `keep` won and the
            # address the reviewer wrote no longer exists. Not fatal (the
            # rename is the reviewer's own), but silent was wrong: say which
            # address went unsettled, in `_lint_entries`' form.
            kind, key, scope = _address(decision["entry"])
            print(f"facts-plan: review: contradiction on {kind}/{key} "
                  f"{scope} · {decision['field']}: renamed by the same "
                  "review, not settled", file=sys.stderr)
            continue
        if decision["resolution"] == "fix":
            set_path(entry, decision["field"], decision["value"])
        else:
            entry.setdefault("accounts", []).extend(
                _account(decision["field"], side) for side in flag["sides"])
        # By address, never by identity: `flag` came from the digest's own
        # `_cross_unit` pass over a deep copy (`scratch`), so it is never the
        # same object as the one in `state["flags"]` — `is not` left every
        # settled drift in the list. This is `_fold_review`'s own predicate.
        state["flags"] = [
            f for f in state["flags"]
            if not (f["code"] == "unit_drift" and f.get("entry")
                    and f.get("field") == decision["field"]
                    and _address(f["entry"]) == _address(decision["entry"]))]


def _unwrap(value, prefix, status):
    """Strip every `{"value", "inferred"}` wrapper and record its QF-7 path —
    §2.5: the model marks the leaf, assemble writes the path."""
    if isinstance(value, dict):
        if set(value) == {"value", "inferred"} and value["inferred"] is True:
            status[prefix] = "inferred"
            return _unwrap(value["value"], prefix, status)
        return {k: _unwrap(v, f"{prefix}/{k}", status) for k, v in value.items()}
    if isinstance(value, list):
        return [_unwrap(m, f'{prefix}/{m["key"]}'
                        if isinstance(m, dict) and "key" in m else prefix, status)
                for m in value]
    return value


def _rename_fields(mechanical, written):
    """`{provisional key: minted key}` and the merged `fields[]`. A field the
    record unit leaves unrenamed keeps `c_h` (§2.5)."""
    by_from = {f["from"]: f for f in written if f.get("from")}
    renames, fields = {}, []
    for field in mechanical:
        theirs = dict(by_from.get(field["key"]) or {})
        theirs.pop("from", None)
        key = theirs.pop("key", None) or field["key"]
        renames[field["key"]] = key
        fields.append({**field, **theirs, "key": key})
    return renames, fields


# --------------------------------------------------------------------------
# T15 steps 2–6 (§2.6): the envelope a decision earns, the merge target, the
# split parts and the `new[]` entries — then step 1, which mints the temp ids
# over all of them at once and resolves every ref and provisional field key.


def _source_of(instance, paths):
    return {"type": "sheet", "ref": paths.get(instance["spreadsheetId"], ""),
            "sheet": instance["sheet"]}


def _process_sources(written, department):
    """§2.5's `processes[]` citations as `source[]` members."""
    out = []
    for citation in written.get("processes") or []:
        source = {"type": "process",
                  "ref": f'departments/{department}/processes/'
                         f'{citation["process"]}.json',
                  "node": citation["node"]}
        if citation.get("quote"):
            source["quote"] = citation["quote"]
        out.append(source)
    return out


#: `extract_attachment.CONVERTERS` read backwards — a sidecar's suffix says what
#: the unit actually read, and `source[].type` has to say the same (ruling 3).
#: Longest suffix first: `.pdf.md`/`.image.md` also end in `.md`.
SIDECAR_TYPES = ((".pdf.md", "pdf"), (".image.md", "photo"), (".txt", "docx"))


def _source_type(rel):
    """`voice` for a transcript, the extracted file's own kind for a sidecar.
    A photographed form is cited as a photo, not as the meeting's audio."""
    if SIDECAR_DIR in rel:
        for suffix, kind in SIDECAR_TYPES:
            if rel.endswith(suffix):
                return kind
    return "voice"


def _unit_sources(unit):
    """What a unit that read text cites: its transcript chunk, by lines, or the
    `.text/` sidecar of the `.docx`/`.pdf`/image it was given. A unit that read
    only a workbook has already cited the tab through its instances, and one
    that read nothing at all cites the chat, which QF-5 admits with a null
    ref."""
    out = []
    for ref in (unit or {}).get("inputs") or []:
        rel, _, span = ref.partition("#")
        if not rel.endswith((".txt", ".md")):
            continue
        source = {"type": _source_type(rel), "ref": rel}
        if span:
            source["lines"] = "-".join(n.lstrip("L") for n in span.split("-"))
        out.append(source)
    return out or [{"type": "chat", "ref": None}]


def _instance_branches(candidate, by_id):
    """The branches of the tabs an entry is written on: its own instances, and
    for a rule the instances of every record its bindings name (§3.2)."""
    payload = candidate.get("payload") or {}
    branches = {i["branch"] for i in payload.get("instances") or []
                if isinstance(i, dict) and i.get("branch")}
    for member in payload.get("applies_to") or []:
        record = by_id.get((member.get("record") or {}).get("ref")) or {}
        branches |= {i["branch"] for i in
                     (record.get("payload") or {}).get("instances") or []
                     if isinstance(i, dict) and i.get("branch")}
    return branches


def _scope_of(candidate, department, decision, by_id):
    """§3.2 — a tab of its own decides; with none, the branches the decision
    names, and otherwise the whole department. `_attach_scopes` runs after the
    refs resolve and puts the attachments between those two."""
    return {"departments": [department],
            "branches": sorted(_instance_branches(candidate, by_id)
                               or set(decision.get("branches") or []))}


def _attachment_refs(data):
    """The four edges §3.2 calls an attachment, in one generator."""
    yield (data.get("of") or {}).get("ref")
    yield (data.get("writes_to") or {}).get("ref")
    for member in data.get("about") or []:
        yield (member or {}).get("ref")
    for member in data.get("tracked") or []:
        yield ((member or {}).get("record") or {}).get("ref")


def _attach_scopes(entries, state, by_temp):
    """§3.2, in one non-transitive pass over the assembled entries: *"A
    transcript-derived decision or `new` entry takes, in one non-transitive
    pass, the union of the scopes of the entries it attaches to (`of`,
    `writes_to`, `about`, `tracked[].record`) … attached to nothing, or only to
    unattached entries, it is department-wide (both branches) unless the
    decision carries `branches`."*

    An entry written on a tab of its own keeps that tab's branches; only what
    the sheets never placed asks its attachments where it lives. Departments
    are not read off the attachment — the run's own is the only one an entry
    may be created in (QF-43), which is §3.2's "restricted to the run's
    department".
    """
    for entry in entries:
        candidate = state["candidates"].get(entry["_skeleton"]) or {}
        if _instance_branches(candidate, state["candidates"]):
            continue
        branches = set()
        for ref in _attachment_refs(entry["data"]):
            target = by_temp.get(ref)
            scope = target["scope"] if target else state["store_scopes"].get(ref)
            branches |= set((scope or {}).get("branches") or [])
        if branches:
            entry["scope"]["branches"] = sorted(branches)


#: F6 — the `source[].type`s that are the form itself rather than talk about it.
READ_OFF_A_FORM = ("sheet", "photo", "pdf", "docx")


#: The three kinds that carry one (spec 2026-09-16); a record is its own
#: place and the store schema forbids it a `home`.
HOMED_KINDS = ("rule", "measurement", "note")


def derive_home(entry, kind_of=None):
    """The table an entry belongs to — what the unit wrote, else what the
    entry's own references say (spec 2026-09-16 §4.1).

    A pure function of its arguments: a rule whose bindings all name one record
    belongs to that record, a measurement belongs to what it is `of` (with the
    column, when it names one), and a note to the first **table** it is `about`
    (owner decision 3). Anything else is unattached — including a record, which
    is a place and has none.

    `kind_of(ref) -> kind | None` is what tells a table from a rule: a note
    that speaks of a rule before the form it is written on belongs to the form,
    and a measurement `of` a rule belongs nowhere. A ref the caller cannot
    place answers `None` and is taken as written — the store severs a `home`
    that names no record, with a note the owner reads (C29).
    """
    if entry.get("kind") not in HOMED_KINDS:
        return None
    written = entry.get("home")
    if isinstance(written, dict) and isinstance(written.get("ref"), str):
        return {k: written[k] for k in ("ref", "field") if written.get(k)}
    data = entry.get("data") or {}
    if entry["kind"] == "rule":
        refs = [(m.get("record") or {}).get("ref")
                for m in data.get("applies_to") or [] if isinstance(m, dict)]
        named = {r for r in refs if isinstance(r, str)}
        return {"ref": named.pop()} if len(named) == 1 else None

    def a_table(member):
        if not (isinstance(member, dict) and isinstance(member.get("ref"), str)):
            return False
        return kind_of is None or kind_of(member["ref"]) in (None, "record")

    source = data.get("of") if entry["kind"] == "measurement" \
        else next((m for m in data.get("about") or [] if a_table(m)), None)
    if not a_table(source):
        return None
    return {k: source[k] for k in ("ref", "field") if source.get(k)}


def _kind_of(state):
    """`ref -> the kind it names`, over this run's candidates (a `new[]` entry
    included) and the store. An `S-`/`N-`/`F-` id nothing knows answers `None`,
    which every caller reads as "no reason to rule it out"."""
    candidates = state.get("candidates") or {}
    stored = state.get("store_kinds") or {}

    def kind_of(ref):
        candidate = candidates.get(ref)
        if candidate:
            return KIND_OF.get(candidate["kind"], candidate["kind"])
        return stored.get(ref)
    return kind_of


def _entry(candidate, decision, state, part=None):
    """Step 2 — the envelope §2.6 describes: the skeleton's mechanical payload
    under the unit's own fields, `source[]` from every instance and binding,
    `scope` per §3.2, the `inferred` wrappers expanded into `field_status`."""
    written = part or decision
    status = {}
    # The payload is unwrapped too, not just what the unit wrote: a `new[]`
    # entry's data travels here as its pseudo-candidate's payload (`_pseudo`),
    # so a hedge the model put on `filled_by`, `location.kept_at` or `by` would
    # otherwise reach the store schema with its wrapper on. A mechanical
    # payload carries no wrappers, so this is a no-op for every real candidate.
    data = _unwrap(copy.deepcopy(candidate["payload"]), "data", status)
    given = _unwrap(written.get("data") or {}, "data", status)
    renames, fields = _rename_fields(data.pop("fields", []),
                                     given.pop("fields", []))
    data.update(given)
    if fields:
        data["fields"] = fields
    # A reference table's rows and its `primaryKey` were built over the same
    # provisional `c_<letter>` keys the fields carried (`reference_rows`), so
    # they follow the fields' renames — otherwise the engine's own rows fail
    # the engine's own gate as `member 'c_b' is not a declared field`, which
    # is what killed the raw-materials unit in every run before 2026-09-08.
    if renames:
        if isinstance(data.get("rows"), list):
            data["rows"] = [{renames.get(k, k): v for k, v in row.items()}
                            if isinstance(row, dict) else row
                            for row in data["rows"]]
        if isinstance(data.get("primaryKey"), list):
            data["primaryKey"] = [renames.get(k, k) for k in data["primaryKey"]]
    takes = written.get("takes")
    if takes is not None:
        for collection in ("applies_to", "instances"):
            if data.get(collection):
                data[collection] = [m for m in data[collection]
                                    if m["key"] in takes]
    sources = [_source_of(i, state["paths"]) for i in data.get("instances") or []]
    location = data.get("location") or {}
    if not sources and location.get("spreadsheetId"):
        sources.append({"type": "sheet",
                        "ref": state["paths"].get(location["spreadsheetId"], ""),
                        "sheet": location.get("sheet", "")})
    if not sources:
        # A rule has no tab of its own: it was read off the tabs of the tables
        # its bindings name.
        for member in data.get("applies_to") or []:
            ref = (member.get("record") or {}).get("ref") if isinstance(member, dict) else None
            table = (state.get("candidates") or {}).get(ref) or {}
            for i in (table.get("payload") or {}).get("instances") or []:
                if _source_of(i, state["paths"]) not in sources:
                    sources.append(_source_of(i, state["paths"]))
    if not sources:
        read = [s for s in _unit_sources(state["units"].get(decision["unit"]))
                if s["type"] != "chat"]
        # …and of those, the ones the unit says this entry came off (task G).
        # A unit handed fourteen photos cited all fourteen on each of its
        # thirteen entries until 2026-09-16 — a citation nobody could check.
        # `from` is already gated to the unit's own inputs, so this only
        # narrows; an entry that names none of them keeps all of them, because
        # citing too much is a smaller loss than citing nothing.
        cited = set(written.get("from") or ())
        sources = [s for s in read if s["ref"] in cited] or read
    # §3 phase 1: what the meeting filled in that the form does not state is
    # cited as the meeting — after the sheet or the photo, so `READ_OFF_A_FORM`
    # and the "form wins a merge" rule both keep reading the first source, and
    # before the process citations, which are not where the value came from.
    # …and never twice: a transcript unit's `_unit_sources` already cites the
    # excerpt it read, so its own `voice` member is the same meeting again.
    for voice in written.get("voice") or []:
        if not any(s.get("type") == "voice" and s.get("ref") == voice["ref"]
                   for s in sources):
            sources.append(voice)
    # The citations hang off the decision, never off a split part (§2.5's
    # `splitPart` has no `processes`), so both parts of a split inherit them.
    # Owner ruling 2026-09-15: they sit beside the real origin, never instead
    # of it — until then a process citation replaced the meeting or sheet.
    sources += _process_sources(decision, state["department"])
    sources = sources or [{"type": "chat", "ref": None}]
    kind = KIND_OF.get(candidate["kind"], candidate["kind"])
    if kind == "record" and not any(s.get("type") in READ_OFF_A_FORM for s in sources):
        # F6 — a table no sheet, photo or document shows was described from
        # speech: its column names, types and units are the model's reading.
        for field in _members(data, "fields"):
            for member in ("title", "type", "unit"):
                if member in field and isinstance(field.get("key"), str):
                    status[f'data/fields/{field["key"]}/{member}'] = "inferred"
    entry = {"kind": kind,
             "key": written["key"],
             "title": written["title"], "statement": written.get("statement") or "",
             "scope": _scope_of(candidate, state["department"], decision,
                                state["candidates"]),
             "source": sources,
             "retired": False, "data": data,
             "_skeleton": candidate["id"], "_unit": decision["unit"],
             "_renames": renames}
    if kind in HOMED_KINDS:
        entry["home"] = derive_home(dict(entry, home=written.get("home")),
                                    _kind_of(state))
    if written.get("aliases"):
        entry["aliases"] = written["aliases"]
    if written.get("accounts"):
        # The form's value stays the entry's; what the unit heard instead is an
        # open account beside it, and `_cross_unit` appends to the same list.
        # ponytail: a split's accounts hang off the decision, so they reach
        # neither part — no rule says which part the disputed leaf landed in.
        entry["accounts"] = copy.deepcopy(written["accounts"])
        for account in entry["accounts"]:
            # The unit spells the leaf by the column key its input printed
            # (`c_b`); `_rename_fields` has since given that field the key the
            # unit itself chose. An account addressing the provisional key
            # names nothing on the stored entry, so `resolve` could not settle
            # it and the form's side below could not be found at all.
            segs = account["field"].split("/")
            if len(segs) > 2 and segs[:2] == ["data", "fields"]:
                segs[2] = renames.get(segs[2], segs[2])
                account["field"] = "/".join(segs)
        # …and the form's own reading is the other side, exactly as step 7
        # writes two for a cross-unit disagreement. `resolve` sets the chosen
        # account's value at the field, so without this side the owner's only
        # answer is to adopt the speech and the entry can never be confirmed.
        for account in list(entry["accounts"]):
            if not path_exists(entry, account["field"]):
                continue
            mine = get_path(entry, account["field"])
            if mine != account["value"]:
                entry["accounts"].append(
                    _account(account["field"],
                             {"value": mine, "source": sources[0]}))
    extra = {**(decision.get("extra") or {}), **((part or {}).get("extra") or {})}
    if extra:
        entry["extra"] = extra                                      # A6
    if status:
        entry["field_status"] = status
    tiers.apply_notes(entry, decision.get("_notes"))
    for issue in state["issues"]:
        if issue.get("target") == candidate["id"] and not issue["run_only"]:
            # `affects` names the entry itself, through the candidate id step 1
            # rewrites to the temp id: the schema requires the link, and an
            # issue attached to no fact is one nobody ever reads.
            entry.setdefault("issues", []).append(
                {"kind": issue["kind"], "instance": issue["instance"],
                 "description": issue["description"], "engine": True,
                 "affects": [{"ref": candidate["id"]}]})
    return entry


def _absorb(target, candidate):
    """Step 3 — the merge target gains the candidate's bindings and instances;
    a keyed member the target already carries is left alone (§11's union).
    Copied, never shared: `_build_entries` runs twice (draft, folded) and
    `_resolve_refs` rewrites members in place, so a shared member would carry
    the first pass's temp id into the second, where it names another entry."""
    for collection in ("applies_to", "instances"):
        held = {m["key"] for m in target["data"].get(collection) or []}
        for member in candidate["payload"].get(collection) or []:
            if member["key"] not in held:
                target["data"].setdefault(collection, []).append(copy.deepcopy(member))


def _undecided(state, skid, **why):
    """One candidate held back, named as the owner reads it (§3.2). Every
    caller passes a `reason`; `refused`/`waits_for` say the rest."""
    candidate = (state.get("candidates") or {}).get(skid) or {}
    state["undecided"].append(
        {"skeleton": skid, "kind": candidate.get("kind"),
         "label": label_of(candidate) if candidate.get("payload") is not None
         else skid,
         "unit": candidate.get("unit"), **why})


def _target_of(state, skid):
    """`merge_into` to a fixpoint, ascending (unit id, skeleton id). A cycle is
    nobody's target: every candidate on it is held back naming the units it
    crosses, `None` comes back, and the rest of the run lands (I5)."""
    seen = []
    while True:
        decision = state["by_skeleton"].get(skid)
        if not decision or decision["action"] != "merge_into":
            return skid
        if skid in seen:
            units = ", ".join(sorted({state["by_skeleton"][s]["unit"]
                                      for s in seen}))
            held = state.setdefault("cycled", set())
            for member in seen:
                if member not in held:
                    held.add(member)
                    _undecided(state, member, reason="cycle",
                               refused=[f"merge_into cycle across units {units}"])
            return None
        seen.append(skid)
        skid = decision["into"]


def _note_key(entry, by_temp):
    """§3.1 — minted from the sorted `(kind, key)` pairs of `about[]` and the
    normalised question, so the same note built twice mints the same key
    whether its target was created in this delta or found in the store."""
    pairs = []
    for about in entry["data"]["about"]:
        target = by_temp.get(about["ref"])
        pairs.append(f'{target["kind"]}:{target["key"]}' if target
                     else about["ref"])
    blob = "‖".join(sorted(pairs)) + "‖" + \
        " ".join((entry["data"].get("question") or "").split())
    return "note_" + hashlib.sha256(blob.encode("utf-8")).hexdigest()[:12]


def _kept_entries(by_id, state):
    """Steps 2 and 6's bodies, before ids, refs and scopes: `{skeleton id (or
    `<id>#<n>` for a split part): entry}`.

    `_build_entries` and `materialise` both come through here — that is the
    whole point of it existing (§3.1): the entry a unit is judged on at its
    gate is built by the code that builds the entry `assemble` folds, so the
    two cannot drift apart the way they did before the 2026-09-07 run.
    """
    kept = {}
    # A candidate `build` set aside for its size is in no unit, so no unit could
    # have decided it: it is held back under its own reason, not as a failure.
    oversized = {i.get("target") for i in state.get("issues") or []
                 if i["kind"] == "oversized"}
    for cid, candidate in sorted(by_id.items()):
        decision = state["by_skeleton"].get(cid)
        label = label_of(candidate)
        if decision is None or candidate.get("unit") in state["failed"]:
            refused = (state.get("refused") or {}).get(cid)
            row = {"skeleton": cid, "kind": candidate["kind"], "label": label,
                   "unit": candidate.get("unit"),
                   "reason": "oversized" if cid in oversized
                   else "failed" if candidate.get("unit") in state["failed"]
                   else "refused" if refused else "not_decided"}
            if row["reason"] == "refused":
                row["refused"] = refused                            # F3
            state["undecided"].append(row)
            continue
        if decision["action"] == "drop":
            state["dropped"].append({"skeleton": cid, "kind": candidate["kind"],
                                     "label": label,
                                     "reason_code": decision["reason_code"],
                                     "unit": decision["unit"]})
        elif decision["action"] == "keep":
            kept[cid] = _entry(candidate, decision, state)
        elif decision["action"] == "split":
            for n, part in enumerate(decision["into"], start=1):
                kept[f"{cid}#{n}"] = _entry(candidate, decision, state, part=part)
    return kept


def _state_for(root, run_dir, doc):
    """The `_entry` state one unit document needs, read off the run.

    Only this unit's candidates and this document's decisions: a candidate of a
    sibling unit has no decision here and would land in `undecided[]`, which is
    `assemble`'s bookkeeping and not the gate's.
    """
    root, run_dir = pathlib.Path(root), pathlib.Path(run_dir)
    skeleton = read_json(run_dir / "skeleton.json")
    plan = read_json(run_dir / "plan.json")
    unit = doc["unit"]
    by_id = {c["id"]: c for c in skeleton["candidates"] if c.get("unit") == unit}
    by_skeleton = {}
    for decision in doc["decisions"]:
        if isinstance(decision, dict) and decision.get("skeleton"):
            by_skeleton[decision["skeleton"]] = dict(decision, unit=unit)
    for n, entry in enumerate(doc.get("new") or []):
        if not isinstance(entry, dict):
            continue
        handle, candidate, decision = _pseudo(entry, unit, n)
        by_id[handle], by_skeleton[handle] = candidate, decision
    # A run always has a manifest; a test estate and a fresh department may not,
    # and a missing one costs a `source[].ref` string, never a shape.
    manifest = root / "attachments" / "sheets" / "manifest.json"
    workbooks = read_json(manifest)["workbooks"] if manifest.is_file() else []
    return by_id, {
        "by_skeleton": by_skeleton, "new": [], "failed": set(),
        "dropped": [], "undecided": [], "provenance": {},
        "department": skeleton["department"], "issues": skeleton["issues"],
        "candidates": by_id,
        "units": {u["id"]: u for u in plan["units"]},
        "paths": {w["spreadsheetId"]: f'attachments/sheets/{w["dir"]}/{w["file"]}'
                  for w in workbooks}}


def _placeholder_refs(entries):
    """1a's cross-unit half, which the gate does not do: a handle this one
    document resolves becomes that entry's temp id, and every other one becomes
    `T-0`. The delta schema's ref pattern is `^(F-[0-9]{5}|T-[0-9]+)$` and
    admits no `S-`/`N-` handle, so without this every cross-unit ref would read
    as a shape error the unit cannot fix. `T-0` is nobody's id, so
    `check_document` treats it as cross-store and leaves it alone — exactly what
    it does with an `F-` ref it cannot see (`content._check_unit_edges`).
    """
    by_skeleton = {e["_skeleton"]: e["id"] for e in entries}
    for entry in entries:
        for obj in iter_ref_objects(entry):
            ref = obj.get("ref")
            if isinstance(ref, str) and ref.startswith(("S-", "N-")):
                obj["ref"] = by_skeleton.get(ref, "T-0")


def materialise(root, run_dir, doc, *, for_validation=True):
    """The entries one unit document would become (§3.1 step 1).

    `for_validation` mints `T-1…T-n` and settles the handles (`_placeholder_refs`)
    so the list is a delta's `entries[]`; the private `_skeleton`/`_unit`/
    `_renames` keys stay on, and the caller strips them — `validate_unit` needs
    `_skeleton` to name the decision an error belongs to.
    """
    by_id, state = _state_for(root, run_dir, doc)
    entries = list(_kept_entries(by_id, state).values())
    entries.sort(key=lambda e: (KIND_ORDER.index(e["kind"]),
                                e["_skeleton"], e["key"]))
    if for_validation:
        for n, entry in enumerate(entries, start=1):
            entry["id"] = f"T-{n}"
        _placeholder_refs(entries)
    return entries


def _unit_labels(doc):
    """`{handle: the label validate_unit's other messages already use}`."""
    out = {f'N-{doc["unit"]}-{n}': f'new[{n}] {entry.get("key")}'
           for n, entry in enumerate(doc.get("new") or []) if isinstance(entry, dict)}
    for n, decision in enumerate(doc["decisions"]):
        if isinstance(decision, dict) and decision.get("skeleton"):
            out[decision["skeleton"]] = f'decisions[{n}] {decision["skeleton"]}'
    return out


def _build_entries(root, skeleton, state):
    """Steps 2–6 with step 1 in the middle: the bodies are built, then the temp
    ids are minted in kind order over all of them, then every `{ref}` and every
    provisional field key is resolved (1a, 1b)."""
    by_id = {c["id"]: c for c in skeleton["candidates"] + state["new"]}
    state["candidates"] = by_id
    state["dropped"], state["undecided"], state["provenance"] = [], [], {}
    kept = _kept_entries(by_id, state)
    for row in state.get("refused_new") or []:
        state["undecided"].append(                                  # F3
            {"skeleton": None, "kind": row["kind"], "unit": row["unit"],
             # never the minted key: a `new[]` entry refused for having no
             # title is exactly the one without a Persian name (M-1 c)
             "label": row["title"] if isinstance(row["title"], str)
             and row["title"].strip() else FA_UNTITLED, "reason": "refused",
             "refused": row["lines"]})
    # A file too big for a unit is no candidate, so the pass above names it
    # nowhere: its issue is the whole record of it, and the owner reads it with
    # everything else this run could not fit (§3.2).
    for issue in state["issues"]:
        if issue["kind"] == "oversized" and issue.get("target") not in by_id:
            state["undecided"].append(
                {"skeleton": None, "kind": "attachment", "unit": None,
                 "label": issue.get("target"), "reason": "oversized"})
    for cid in sorted(state["by_skeleton"],
                      key=lambda k: (state["by_skeleton"][k]["unit"], k)):
        decision = state["by_skeleton"][cid]
        if decision["action"] != "merge_into":
            continue
        target = _target_of(state, cid)
        if target is None:                      # the cycle held its own back
            continue
        if target not in kept:
            # I5 — the merger waits for the target its unit never kept, and
            # everything else lands.
            _undecided(state, cid, reason="target_dropped", waits_for=target,
                       waits_for_unit=(by_id.get(target) or {}).get("unit", "?"))
            continue
        _absorb(kept[target], by_id[cid])
    entries = list(kept.values())
    entries.sort(key=lambda e: (KIND_ORDER.index(e["kind"]),
                                e["_skeleton"], e["key"]))
    for n, entry in enumerate(entries, start=1):
        entry["id"] = f"T-{n}"
        state["provenance"][entry["id"]] = entry["_unit"]
    entries = _resolve_refs(entries, state)
    by_temp = {e["id"]: e for e in entries}
    _attach_scopes(entries, state, by_temp)
    for entry in entries:
        if entry["kind"] == "note":
            entry["key"] = _note_key(entry, by_temp)
    return entries


def _sever_unknown(entry, known):
    """C29 at the assembly as at `apply`: an `F-` ref naming no store entry is
    severed with a note — its whole member when it fills a required slot. A
    note whose every `about` names nothing is left for the hold-back (C30)."""
    public = {k: v for k, v in entry.items() if not k.startswith("_")}
    sites = list(_ref_sites(public, []))
    gone = [(path, obj["ref"]) for path, obj in sites
            if isinstance(obj.get("ref"), str) and obj["ref"].startswith("F-")
            and obj["ref"] not in known and path != ["home"]]
    about = [path for path, _ in sites if path[:2] == ["data", "about"]]
    if about and len([p for p, _ in gone if p[:2] == ["data", "about"]]) == len(about):
        return
    found = []
    for path, ref in reversed(gone):
        if len(path) >= 3 and (path[-3], path[-1]) in REQUIRED_SLOTS:
            path = path[:-1]
        found += _sever_member(entry, path, entry.get("key"),
                               f"ref {ref} is in no store entry")[1]
    tiers.apply_notes(entry, found)


def _resolve_refs(entries, state):
    """1a and 1b in one walk: an `S-` ref becomes the temp id of that
    candidate's kept entry, an `F-` ref is checked against the store, and a
    provisional field key is rewritten to the one the record decision minted.
    An `imports[].source` whose target was dropped falls back to its locator;
    anything else naming a dropped or failed candidate is an error naming both
    units.

    An `N-<unit>-<n>` handle — the one §2.6 step 6 gives a `new[]` entry —
    resolves exactly as an `S-` id does, so a unit can mint an entity and point
    at it in the same run: a record's `movement` ends are records of their own,
    and the paper one is minted by the unit that read the meeting.

    The handle is run-wide, not unit-local: `by_skeleton` below is built from
    every kept entry of every unit, so a phase-2 unit's note may address a
    phase-1 unit's `new[]` form by its handle (spec 2026-09-15 §3).
    """
    dropped = {d["skeleton"]: d["unit"] for d in state["dropped"]}
    for entry in entries:
        for source in (member.get("source")
                       for instance in entry["data"].get("instances") or []
                       for member in instance.get("imports") or []):
            ref = (source or {}).get("ref")
            if isinstance(ref, str) and ref.startswith("S-") \
                    and ref not in {e["_skeleton"] for e in entries}:
                source.pop("ref", None)
                source.update(state["locators"].get(ref, {}))
    for entry in entries:
        _sever_unknown(entry, state["store_scopes"])
    # An entry pointing at a candidate no unit kept is held back, not a wall:
    # one table a unit could not finish (the raw-materials workbook on
    # 2026-09-08) must not cost the owner every other entry of the run. It
    # joins `undecided[]` naming what it waited for, and the fresh run that
    # finishes the table brings it back. Held-back entries can themselves be
    # referenced, so this runs to a fixpoint.
    kept = list(entries)
    while True:
        by_skeleton = {e["_skeleton"]: e for e in kept if e["_skeleton"]}
        held = []
        for entry in kept:
            for obj in iter_ref_objects(entry):
                ref = obj.get("ref")
                if not isinstance(ref, str) or obj is entry.get("home"):
                    continue
                if ref.startswith(("S-", "N-")) and ref not in by_skeleton:
                    owner = dropped.get(ref) \
                        or (state["candidates"].get(ref) or {}).get("unit") or "?"
                    held.append((entry, {"reason": "waits", "waits_for": ref,
                                         "waits_for_unit": owner}))
                    break
                if ref.startswith("F-") and ref not in state["store_scopes"]:
                    held.append((entry, {"reason": "unknown_ref", "refused": [
                        f"ref {ref} is in no store entry"]}))
                    break
        if not held:
            break
        for entry, why in held:
            state["undecided"].append(
                {"skeleton": entry["_skeleton"], "kind": entry["kind"],
                 "label": entry["title"], "unit": entry["_unit"], **why})
            state["provenance"].pop(entry["id"], None)
            kept.remove(entry)
        _sever_derived(kept, {e["_skeleton"] for e, _ in held if e["_skeleton"]},
                       key="_skeleton")
    placed = set(by_skeleton) | {e["id"] for e in kept if e.get("id")}
    for entry in kept:
        _place(entry, placed, state["store_scopes"])
        for obj in iter_ref_objects(entry):
            ref = obj.get("ref")
            if isinstance(ref, str) and ref.startswith(("S-", "N-")):
                target = by_skeleton[ref]
                obj["ref"] = target["id"]
                if obj.get("field") in (target.get("_renames") or {}):
                    obj["field"] = target["_renames"][obj["field"]]
    return kept


def _place(entry, placed, store):
    """An entry's `home` against what this run kept — by handle (`S-`/`N-`), by
    the temp id a review names it with, or by the store's own `F-` id. A table
    nobody kept costs the entry its place and nothing else (C29's note, without
    the hold-back).

    Placement is not a fact: an entry whose table was dropped, failed or was
    held back still lands, unattached, and the panel lists it under «بدون
    جدول» — holding it back instead would cost the owner the fact itself.
    """
    ref = (entry.get("home") or {}).get("ref")
    if not isinstance(ref, str) or ref in placed or ref in store:
        return
    entry["home"] = None
    tiers.apply_notes(entry, [note(entry.get("key") or "",
                                   f"home: ref {ref} is in no entry of this run",
                                   path="home")])


# --------------------------------------------------------------------------
# T15 steps 7–9 (§2.6): the cross-unit pass and its flags, the §5.2 lint, and
# the files the run leaves behind — `facts-delta.json`, `assembly.json` and the
# owner's `gate-b.md`, with `review/input.md` beside them.


def _leaves(data, prefix="data"):
    """`{QF-7 path: value}` for every scalar under `data` — what step 7 compares
    when two units describe one entry."""
    out = {}
    if isinstance(data, dict):
        for key, value in data.items():
            out.update(_leaves(value, f"{prefix}/{key}"))
    elif isinstance(data, list):
        for member in data:
            if isinstance(member, dict) and "key" in member:
                out.update(_leaves({k: v for k, v in member.items() if k != "key"},
                                   f'{prefix}/{member["key"]}'))
    elif data is not None:
        out[prefix] = data
    return out


def _bare(shape):
    """A formula shape with the wrapper calls and their punctuation removed."""
    for name in WRAPPERS:
        shape = shape.replace(name, "")
    return re.sub(r"CONVERT_[A-Z0-9_]*", "", shape) \
             .translate(str.maketrans("", "", "() \t\n"))


def _wrapper_variants(entries, state):
    """§2.6 step 7's run-scoped flag: a candidate whose variants read the same
    thing under a unit conversion or a total is one rule, not several — and the
    reviewer is told so before a unit makes it two."""
    out = []
    for entry in entries:
        variants = ((state["candidates"].get(entry["_skeleton"]) or {})
                    .get("render") or {}).get("variants") or []
        shapes = {v.get("shape") for v in variants if v.get("shape")}
        if len(shapes) > 1 and len({_bare(shape) for shape in shapes}) == 1:
            out.append({"code": "wrapper_variants", "id": entry["id"],
                        "message": "variants differ only by a wrapper: "
                                   + "، ".join(sorted(shapes))})
    return out


def _template_split(entries):
    """§2.6 step 7's second run-scoped flag: one tab written up twice under two
    keys. §3.2 is why it cannot be left to `apply` — `find_match` answers None
    for an instance match whose natural key disagrees, so `apply` never renames
    and refuses the pair outright; the reviewer is the one who can still say
    which key the template has."""
    seen, out = {}, []
    for entry in entries:
        for ident in _sheet_identities(entry):
            other = seen.setdefault(ident, entry)
            if other is entry or _address(other) == _address(entry):
                continue
            out.append({"code": "template_split", "id": other["id"],
                        "message": f'{other["id"]} ({other["key"]}) and '
                                   f'{entry["id"]} ({entry["key"]}) both claim '
                                   f"{ident[0]}/{ident[1]}"})
    return out


def _homeless(entries):
    """§2.6 step 7's third run-scoped flag (spec 2026-09-16): a rule or a
    measurement this run placed under no table, beside the tables of the same
    run whose titles read like it. The reviewer answers it with a `keep`
    carrying `home`, exactly as it corrects any other member.

    Both halves of the line are addresses the reviewer can use: the flag
    carries its `entry`, so `_digest_text` names it `rule <key>` the way a
    decision addresses it, and each candidate is named by the temp id a
    review's `home` carries as well as by its key and title.
    """
    records = [e for e in entries if e["kind"] == "record"]
    out = []
    for entry in entries:
        if entry["kind"] not in ("rule", "measurement") or entry.get("home"):
            continue
        mine = _tokens(entry["title"])
        near = [r for r in records
                if len(mine & _tokens(" ".join([r["title"]]
                                               + list(r.get("aliases") or [])))) >= 2]
        if near:
            out.append({"code": "homeless", "id": entry["id"],
                        "entry": {"kind": entry["kind"], "key": entry["key"],
                                  "scope": entry["scope"]},
                        "candidates": [r["id"] for r in near],
                        "message": "no home; these tables read like it: "
                                   + "، ".join(f'{r["id"]} {r["key"]} '
                                               f'«{r["title"]}»' for r in near)})
    return out


def _cross_unit(root, entries, state):
    """Step 7 — two `keep`s minting one `(kind, key, scope)` are merged with the
    lowest unit's prose; a scalar the two disagree on becomes two accounts when
    their sources differ in kind, and `unit_drift` for the reviewer when they do
    not. `apply` mints the account ids, which is why none is written here."""
    groups = {}
    for entry in entries:
        groups.setdefault(_address(entry), []).append(entry)
    survivors, flags = [], []
    for members in groups.values():
        members.sort(key=lambda e: (e["_unit"], e["id"]))
        keeper = members[0]
        for other in members[1:]:
            entries.remove(other)
            flags.append({"code": "duplicate_title", "id": keeper["id"],
                          "message": f'{other["_unit"]} wrote another wording '
                                     f'for «{keeper["title"]}»'})
            mine, theirs = _leaves(keeper["data"]), _leaves(other["data"])
            for path, value in sorted(theirs.items()):
                if path not in mine or mine[path] == value:
                    continue
                kinds = {keeper["source"][0]["type"], other["source"][0]["type"]}
                sides = [{"unit": holder["_unit"], "value": held,
                          "source": holder["source"][0]}
                         for holder, held in ((keeper, mine[path]), (other, value))]
                if len(kinds) == 1:
                    # One artefact read twice: nobody is quoting a different
                    # document, so there is nothing for the owner to choose
                    # between. T15b's reviewer settles it off this record.
                    flags.append({"code": "unit_drift", "id": keeper["id"],
                                  "message": f'{path}: {mine[path]!r} '
                                             f'({keeper["_unit"]}) vs '
                                             f'{value!r} ({other["_unit"]})',
                                  "entry": {"kind": keeper["kind"],
                                            "key": keeper["key"],
                                            "scope": keeper["scope"]},
                                  "field": path, "sides": sides})
                    continue
                for side in sides:
                    keeper.setdefault("accounts", []).append(_account(path, side))
        survivors.append(keeper)
    flags += _template_split(survivors) + _wrapper_variants(survivors, state) \
        + _homeless(survivors)
    flags += flags_over(root, [{k: v for k, v in e.items()
                                if not k.startswith("_")} for e in survivors])
    state["flags"] = flags


def _review_labels(entries, reviewed):
    """Who answers for each assembled entry, one label per entry and no two
    alike: `review: <key>` for what the review rewrote, `<unit>: <key>` for the
    rest, and the entry's kind and scope appended when the key alone would name
    two of them. `assemble` maps a lint line back to its entry through these
    labels, so a key minted in two scopes must not collapse to one — the sound
    decision would be held back beside the failing one. `_cross_unit` leaves one
    entry per `(kind, key, scope)`, which is what makes the long form unique."""
    base = [f'review: {e["key"]}' if e["_skeleton"] in reviewed
            else f'{e["_unit"]}: {e["key"]}' for e in entries]
    twice = collections.Counter(base)
    return [b if twice[b] == 1 else f'{b} {e["kind"]} {_address(e)[2]}'
            for b, e in zip(base, entries)]


def _lint_entries(root, entries, symbols, reviewed=()):
    """Step 8 — the §5.2 lint AND the store contract over every finished entry;
    a failure is refused, never stored, and the message names who wrote it.

    An assembled entry has a decision's shape where the lint looks (title,
    statement, aliases, `data`), so this is QF-51's own pass run once more over
    what the delta would carry: the same surface, which is what makes it a real
    gate for the one document no unit pass ever saw — the review's. Ruling 5:
    the shape half is that document's gate too, which is why `_contract_problems`
    runs here and not only at `validate_unit`.

    Returns `(findings, labels)`: `labels[i]` is what entry `i` was judged
    under — taken before a repair re-keys it (C22), so a finding still maps
    back to its entry afterwards."""
    named = _review_labels(entries, reviewed)
    conventions = load_conventions(root)
    out = _contract_problems(root, entries, named, symbols)
    for entry, label in zip(entries, named):
        out += _labelled(label, _lint_decision(entry, label, symbols,
                                               entry.get("kind"), conventions))
    return list(dict.fromkeys(out)), named


def _digest_text(state, entries):
    """`review/input.md` (§2.6) — one line per assembled entry, the flags, and
    the dropped candidates with their reason codes."""
    lines = ["# digest", "", "## entries", ""]
    keys = {e["id"]: e["key"] for e in entries}
    for entry in entries:
        data = entry["data"]
        tail = {"rule": f'expr: {data.get("expr")}',
                "record": "fields: " + "، ".join(
                    f'{f["key"]}[{f.get("unit") or "—"}]'
                    for f in data.get("fields") or [])}.get(entry["kind"], "")
        kinds = " · ".join(sorted({s["type"] for s in entry.get("source") or []}))
        line = [entry["kind"], entry["key"], _address(entry)[2], entry["title"],
                entry["statement"], tail]
        if entry["kind"] in HOMED_KINDS:
            # The table it sits under, by the key the reviewer addresses an
            # entry with — never the temp id, which names nothing it can read.
            ref = (entry.get("home") or {}).get("ref")
            line.append(f'جدول: {keys.get(ref, ref) if ref else "—"}')
        lines.append(" · ".join(line + [f"منابع: {kinds}"]))
    lines += ["", "## flags", ""]
    # A flag's `id` is a temp id minted for this assembly and nowhere else, so
    # it addresses nothing the reviewer can go and read. A flag that carries the
    # entry it is about is named by it instead.
    def who(flag):
        entry = flag.get("entry")
        return f'{entry["kind"]} {entry["key"]}' if entry else flag["id"]

    lines += [f'{f["code"]} · {who(f)} · {f["message"]}'
              for f in state["flags"]] or ["—"]
    lines += ["", "## dropped", ""]
    lines += [f'{d["skeleton"]} · {d["kind"]} · {d["label"]} · {d["reason_code"]}'
              for d in state["dropped"]] or ["—"]
    # The reviewer rewrites `title`/`statement` and may `keep` with `data`, so
    # it is held to the same closed contract the units are (§3.2).
    lines += ["", shape_section(state.get("unit_symbols") or (),
                                state.get("conventions") or DEFAULT_CONVENTIONS)]
    return "\n".join(lines) + "\n"


def _prepare(root, run_dir, review, exclude=frozenset(), held=None, only=None):
    """Everything both verbs share: the run's files, the store, and the units'
    decisions with the review folded in when asked for.

    `only` narrows the run to those units — every other one is read as absent,
    which is what `phase_entries` needs to fold one phase on its own."""
    run_dir = pathlib.Path(run_dir)
    skeleton = read_json(run_dir / "skeleton.json")
    plan = read_json(run_dir / "plan.json")
    if only is not None:
        plan = dict(plan, units=[u for u in plan["units"] if u["id"] in only])
    manifest = read_json(pathlib.Path(root) / "attachments" / "sheets" /
                         "manifest.json")
    store = load_store(root)
    state = _collect(root, run_dir, plan, skeleton)
    state.update({
        "department": skeleton["department"], "issues": skeleton["issues"],
        # The reviewer is held to the same closed unit list a unit is (§3.3),
        # so the digest carries it; `scratch` is a copy of this state, so the
        # document the hash is checked against carries the same section.
        "unit_symbols": skeleton.get("unit_symbols") or [],
        # The estate's own conventions (§3.1) ride with the state, so the
        # digest the reviewer read and the digest its hash is checked against
        # are rendered from one object.
        "conventions": load_conventions(root),
        "units": {u["id"]: u for u in plan["units"]},
        "hashes": plan.get("hashes") or {},
        "paths": {w["spreadsheetId"]: f'attachments/sheets/{w["dir"]}/{w["file"]}'
                  for w in manifest["workbooks"]},
        "locators": {i["source"].get("ref"): {k: v for k, v in i["source"].items()
                                              if k != "ref"}
                     for i in skeleton["imports"] if i["source"].get("ref")},
        # Both halves of what the store answers here: whether an `F-` ref
        # exists (1a) and where its entry sits (§3.2's attachment union).
        "store_scopes": {e["id"]: canonical_scope(e.get("scope"))
                         for kind in KIND_ORDER
                         for e in store[kind]["entries"]},
        # …and what kind each one is, which is what tells a note's `about`
        # list which of its members is a table (`derive_home`).
        "store_kinds": {e["id"]: kind for kind in KIND_ORDER
                        for e in store[kind]["entries"]}})
    if review:
        # The reviewer read the assembly as it stood *before* the review, flags
        # and all — so the hash is checked against that same document, rebuilt
        # here on a copy nothing folded in can touch.
        scratch = copy.deepcopy(state)
        draft = _build_entries(root, skeleton, scratch)
        _cross_unit(root, draft, scratch)
        state["review_status"] = _fold_review(root, run_dir, state, draft, scratch,
                                              exclude, held)
    return run_dir, skeleton, state


def phase_entries(root, run_dir, unit_ids):
    """The gated, folded entries of the named units — what a phase-2 unit is
    told is recorded (spec 2026-09-15 §3). Same fold `assemble` uses, over
    those units only; nothing is minted and nothing is written.

    A unit whose every attempt was refused whole folds nothing and contributes
    nothing here, exactly as it contributes nothing to the assembly.
    """
    run_dir, skeleton, state = _prepare(pathlib.Path(root), pathlib.Path(run_dir),
                                        False, only=set(unit_ids))
    out = [{"handle": e["_skeleton"], "kind": e["kind"], "key": e.get("key"),
            "title": e.get("title"), "statement": e.get("statement"),
            "data": copy.deepcopy(e.get("data") or {})}
           for e in _build_entries(root, skeleton, state)]
    return sorted(out, key=lambda e: (KIND_ORDER.index(e["kind"]), e["handle"]))


def digest(root, run_dir):
    """`review/input.md` + `review/input.sha256` — steps 1–7 in memory, the temp
    ids discarded. Over `DIGEST_CEILING` the run stops (R7) — nothing is
    written and the reviewer is never skipped."""
    run_dir, skeleton, state = _prepare(root, run_dir, False)
    entries = _build_entries(root, skeleton, state)
    _cross_unit(root, entries, state)
    text = _digest_text(state, entries)
    path = run_dir / "review" / "input.md"
    tokens = estimate_tokens(text)
    if tokens > DIGEST_CEILING:
        print(f"facts-plan: digest is {tokens} tokens, over the "
              f"{DIGEST_CEILING} ceiling — the assembled result must be "
              "reviewed in slices, which this engine cannot yet do; the run "
              "stops here", file=sys.stderr)
        raise SystemExit(2)
    write_text_atomic(path, text)
    write_text_atomic(run_dir / "review" / "input.sha256",
                      hashlib.sha256(text.encode("utf-8")).hexdigest() + "\n")
    return path


def assemble(root, run_dir, *, review=False):
    """Steps 0–9 once over the merged decision set (§2.6). Deterministic:
    ascending unit id, ascending skeleton id, ids minted in kind order."""
    # R2's fold loop: a `review: <key>` lint line names the review decision(s)
    # that touched that entry, so those are held back and the review is folded
    # again without them, to a fixpoint. Every pass strictly grows `exclude`
    # (an excluded decision is not folded, so its entry reverts to the unit's
    # and stops earning the line), which is what bounds the loop.
    exclude, held_rows = set(), {}
    for _outer in range(10_000):
        run_dir, skeleton, state = _prepare(root, run_dir, review,
                                            exclude, held_rows)
        entries = _build_entries(root, skeleton, state)
        _cross_unit(root, entries, state)
        _settle(entries, state)
        symbols = skeleton.get("unit_symbols") or []
        reviewed = state.get("reviewed") or ()
        retry = False
        # Step 8 holds an entry back rather than refusing the run: what the unit
        # gate could not judge — a rule summing another unit's table by column
        # names that unit never minted (the central report over the raw-materials
        # table, 2026-09-08) — waits in `undecided[]` with its lines, the entries
        # that point at it wait with it, and everything else lands. A run refuses
        # only when nothing at all can be assembled.
        for _round in range(len(entries) + 1):
            found, labels = _lint_entries(root, entries, symbols, reviewed)
            # The labels `_lint_entries` judged under, so a finding maps back to
            # the entry that earned it even when a repair re-keyed it (M-2).
            by_label = dict(zip(labels, entries))
            for finding in tiers.notes(found):                      # A38
                if finding.label in by_label:
                    tiers.apply_notes(by_label[finding.label], [finding])
            problems = tiers.refusals(found)
            if not problems:
                break
            review_lines = [p for p in problems if p.label.startswith("review: ")]
            if review_lines:
                # The reviewer's own rewrite: held back by decision (R1), never
                # by refusing the run — the unit's sound version stands under it
                # and the owner is told which decision went and why.
                for line in review_lines:
                    entry = by_label.get(line.label)
                    decisions = (state["reviewed_by"].get(entry["_skeleton"])
                                 if entry else None) or []
                    if not decisions:
                        # No decision owns the line — a defect, and holding
                        # nothing back would loop. Say it and stop.
                        print(f"facts-plan: {line.line()}", file=sys.stderr)
                        raise SystemExit(2)
                    for n in decisions:
                        held_rows.setdefault(n, ("refused", []))[1].append(line.line())
                        exclude.add(n)
                retry = True
                break
            held = {}
            for line in problems:
                if line.label in by_label:
                    held.setdefault(by_label[line.label]["id"], []).append(line.message)
            if not held or len(held) == len(entries):
                for line in problems:
                    print(f"facts-plan: {line.line()}", file=sys.stderr)
                raise SystemExit(2)
            entries = _hold_back(entries, state, held)
        if not retry:
            break
    # I5's other half: a run stops only when nothing can be assembled. Every
    # reason it got there is printed, because this is the one message the owner
    # gets instead of a delta.
    if not entries:
        print(f'facts-plan: nothing assembled — '
              f'{len(state["candidates"])} candidates, '
              f'{len(state["undecided"])} held back', file=sys.stderr)
        for row in state["undecided"]:
            print(f'facts-plan: nothing assembled — {row["unit"]}: '
                  f'{row["label"]}: '
                  f'{(row.get("refused") or [row.get("reason")])[0]}',
                  file=sys.stderr)
        raise SystemExit(2)
    clean = [{k: v for k, v in e.items() if not k.startswith("_")}
             for e in entries]
    write_json_atomic(run_dir / "facts-delta.json",
                      {"schema_version": 2, "entries": clean})
    write_json_atomic(run_dir / "assembly.json",
                      {"dropped": state["dropped"], "undecided": state["undecided"],
                       "provenance": state["provenance"],
                       "review_status": state["review_status"],
                       "review_held": state.get("review_held") or [],
                       "lost_sources": _lost_sources(root, skeleton, state)})
    write_text_atomic(run_dir / "gate-b.md", gate_b(root, skeleton, entries, state))
    return {"entries": len(clean), "dropped": len(state["dropped"]),
            "undecided": len(state["undecided"]),
            "review_status": state["review_status"],
            "review_held": len(state.get("review_held") or [])}


def _sever_derived(entries, gone, key="id"):
    """A column derived by an entry that waits keeps its table: the link is
    left empty and the rule re-links when it lands. Holding four report tables
    back for one rule's identifier would take nine more rules with them.

    `gone` names the entries that wait, by `key` — their temp ids in
    `_hold_back`, their skeleton ids in `_resolve_refs`, which runs before the
    refs are rewritten.
    """
    for entry in entries:
        if entry.get(key) in gone:
            continue
        for field in entry["data"].get("fields") or []:
            derived = field.get("derived") if isinstance(field, dict) else None
            if isinstance(derived, dict) and derived.get("ref") in gone:
                field["derived"] = None


def _hold_back(entries, state, held):
    """Remove the entries step 8 refused (`{temp id: [lines]}`) and every
    entry that points at one of them, to a fixpoint; each joins `undecided[]`
    naming what it waited for, and its temp id leaves `provenance` and the
    flags. Prints one line per held entry so the console says what happened."""
    waiting = dict(held)
    by_id = {e["id"]: e for e in entries}
    _sever_derived(entries, set(waiting))
    while True:
        grew = False
        for entry in entries:
            if entry["id"] in waiting:
                continue
            for obj in iter_ref_objects(entry):
                ref = obj.get("ref")
                if isinstance(ref, str) and ref in waiting and ref in by_id:
                    waiting[entry["id"]] = [f'waits for {by_id[ref]["_unit"]}: '
                                            f'{by_id[ref]["key"]}']
                    grew = True
                    break
        if not grew:
            break
    kept = []
    for entry in entries:
        lines = waiting.get(entry["id"])
        if lines is None:
            kept.append(entry)
            continue
        state["undecided"].append({"skeleton": entry["_skeleton"],
                                   "kind": entry["kind"], "label": entry["title"],
                                   "unit": entry["_unit"], "reason": "refused",
                                   "refused": lines})
        state["provenance"].pop(entry["id"], None)
        print(f'facts-plan: held back {entry["_unit"]}: {entry["key"]}: '
              f"{lines[0]}", file=sys.stderr)
    kept_ids = {e["id"] for e in kept}
    state["flags"] = [f for f in state.get("flags") or []
                      if not isinstance(f.get("entry"), dict)
                      or f["entry"].get("id") in kept_ids]
    return kept


def _rule_line(entry):
    """A rule as the owner reads it: its own title, and the numeric values its
    bindings carry — never a formula, a column or a table name (§2.5)."""
    numbers = []
    for member in entry["data"].get("applies_to") or []:
        for _key, value in sorted((member.get("params") or {}).items()):
            if isinstance(value, (int, float)) and value not in numbers:
                numbers.append(value)
    line = f'  • {entry["title"]}'
    return line + (": " + "، ".join(_fa(n) for n in numbers) if numbers else "")


def _disputes(entries):
    """The open accounts grouped by `(entry, field)` — one dispute per field
    two sources disagree on, in one order.

    The owner answers «۱ الف» from the report and the playbook resolves what that
    number named, so `gate-b.md` (the run's record) and `report.md` have to number the same list
    the same way — and two differing leaves on one entry are two disputes with
    two sides each, never one dispute with four.
    """
    out = []
    for entry in entries:
        by_field = {}
        for account in entry.get("accounts") or []:
            if account.get("status") == "open":
                by_field.setdefault(account.get("field"), []).append(account)
        out += [(entry, sides) for sides in by_field.values()]
    # Ordered by what a dispute IS, never by where it sat in its container:
    # `gate_b` is handed the assembled entries and `report` reads them back out
    # of the store, and those are two lists in two orders.
    return sorted(out, key=lambda d: (KIND_ORDER.index(d[0]["kind"]),
                                      *_address(d[0])[1:],
                                      d[1][0].get("field") or ""))


#: §3.7. `gate_b` counts every other issue kind under «ایرادهای یافته‌شده در
#: فایل‌ها» (`report` names none of them — owner ruling, 2026-09-09); this one is
#: not a problem inside a file, it is a file nobody read, and it belongs beside
#: the workbook the owner has not placed, in both files.
UNREAD_KIND = "unread_attachment"

#: Neither of these is an issue found IN a file: the unread files have their own
#: heading and the set-aside candidates are named with the rest of what was held
#: back, so counting them among the file problems would name them twice.
NOT_A_FILE_ISSUE = (UNREAD_KIND, "oversized")


def _held_back_blocks(undecided, reasons, bullet):
    """§3.2 — what was held back, grouped by reason, one fixed Persian line
    each. `gate-b.md` prints only the set-aside block; `report.md` prints them
    all."""
    grouped = {}
    for row in undecided:
        grouped.setdefault(row.get("reason") or "failed", []).append(
            row.get("label") or "")
    out = []
    for reason in reasons:
        labels = grouped.get(reason)
        if labels:
            out.append(f"{UNDECIDED_FA[reason]} ({_fa(len(labels))} مورد):")
            out += [f"{bullet}«{label}»" for label in labels[:5]]
            out.append("")
    return out


def _skipped_workbooks(root, department):
    """§2.1's Stage 2 row: `dump-workbook --manifest` skips a row the owner has
    not placed, and this is where that workbook is named — by its file title and
    branch, the way `build._where` names a tab, never by an id or a path."""
    manifest = read_json(pathlib.Path(root) / "attachments" / "sheets" /
                         "manifest.json")
    branch_fa = {b["code"]: b["name"] for b in manifest.get("branches") or []}
    out = []
    for row in manifest["workbooks"]:
        departments = row.get("departments") or []
        # An unplaced row belongs to no department, so no run would ever name it
        # if this asked for a match alone.
        if not row.get("unresolved") or (departments
                                         and department not in departments):
            continue
        where = "، ".join(branch_fa.get(b, b) for b in row.get("branches") or [])
        out.append(f'  • «{pathlib.Path(row.get("file") or "").stem}»'
                   + (f" ({where})" if where else "") + ": "
                   + " و ".join(UNRESOLVED_FA.get(c, c) for c in row["unresolved"])
                   + " مشخص نشده است.")
    return out


def _unread_block(root, department, issues):
    """The one list both owner-facing files print: the workbooks the owner has
    not placed, and the attachments nothing could read (§3.7). One heading, one
    implementation — `gate-b.md` and `report.md` cannot disagree about what was
    left out of a run."""
    rows = _skipped_workbooks(root, department) + [
        f'  • {i["description"]}' for i in issues if i["kind"] == UNREAD_KIND]
    if not rows:
        return []
    return [f"فایل‌هایی که در این اجرا خوانده نشدند ({_fa(len(rows))}"
            " مورد) — پس از تعیین تکلیف، در اجرای بعدی خوانده می‌شوند:"] \
        + rows + [""]


#: A photographed form (F5): `extract_attachment.CONVERTERS`' image files, and
#: their sidecar when the file itself is gone.
PHOTO_SUFFIXES = (".jpg", ".jpeg", ".png", ".webp", ".image.md")


def _attachment_name(root, rel):
    """The owner's name for the file a `.text/` sidecar was read out of —
    `extract_attachment.cache_path` read backwards, `forms__tahvil.txt` →
    `forms/tahvil.docx` — or the sidecar's own name when the file is gone."""
    from extract_attachment import owner_rel
    sidecar = pathlib.PurePosixPath(rel)
    owner = owner_rel(root, rel)
    return pathlib.PurePosixPath(owner).relative_to(
        sidecar.parent.parent).as_posix() if owner else sidecar.name


def _workbook_name(root, department, file):
    """A workbook as the owner names it: its file title when that is Persian,
    else the department's name (and the branch, for a one-branch book) — the
    estate's files are transliterations of exactly that (`Amadesazi.xlsx`)."""
    stem = pathlib.PurePosixPath(file).stem
    if not re.search(r"[A-Za-z]", stem):
        return stem
    registry = read_json(pathlib.Path(root) / "departments" / "registry.json")
    manifest = read_json(pathlib.Path(root) / "attachments" / "sheets" / "manifest.json")
    name = next((d["name"] for d in registry["departments"]
                 if d["code"] == department), department)
    row = next((w for w in manifest["workbooks"] if w.get("file") == file), {})
    branches = {b["code"]: b["name"] for b in manifest.get("branches") or []}
    mine = row.get("branches") or []
    return f"{name} {branches.get(mine[0], mine[0])}" if len(mine) == 1 else name


def _lost_sources(root, skeleton, state):
    """F5 — every input no unit's output carried into the assembly: the
    workbooks and recordings of a `failed` unit, and each attachment that was
    in a failed unit or in none. `report` names them first."""
    units = state["units"]
    counts = collections.Counter((c.get("unit"), KIND_OF.get(c["kind"], c["kind"]))
                                 for c in skeleton["candidates"])
    landed = {ref.partition("#")[0] for uid, u in units.items()
              if uid not in state["failed"] for ref in u.get("inputs") or []}
    out, lost, rows = [], set(), {}
    for uid in sorted(state["failed"]):
        unit = units.get(uid) or {}
        refs = [ref.partition("#")[0] for ref in unit.get("inputs") or []]
        if unit.get("type") == "workbook":
            # One row per workbook, however many of its parts failed; `part`
            # when another part of it landed (M-1 b).
            label = "، ".join(_workbook_name(root, state["department"], f)
                              for f in refs)
            row = rows.get(("workbook", label))
            if row is None:
                row = rows[("workbook", label)] = {
                    "kind": "workbook", "label": label, "tables": 0, "formulas": 0}
                out.append(row)
            row["tables"] += counts[(uid, "record")]
            row["formulas"] += counts[(uid, "rule")]
            if any(ref in landed for ref in refs):
                row["part"] = True
        for ref in refs:
            if SIDECAR_DIR in ref:
                lost.add(ref)
            elif unit.get("type") == "transcript" and ("recording", ref) not in rows:
                # One row per meeting, however many of its chunks were lost; a
                # meeting with no date in its name has no Persian label (M-1 c).
                stem = pathlib.PurePosixPath(ref).stem
                date = re.search(r"([0-9]{4})-([0-9]{2})-([0-9]{2})(?:-0*([0-9]+))?$", stem)
                label = (f"{_fa(date.group(1))}/{_fa(date.group(2))}/{_fa(date.group(3))}"
                         + (f" ({_fa(date.group(4))})" if date.group(4) else "")) \
                    if date else None
                rows[("recording", ref)] = {"kind": "recording", "label": label,
                                            "tables": 0, "formulas": 0}
                out.append(rows[("recording", ref)])
    placed = {ref.partition("#")[0] for u in units.values()
              for ref in u.get("inputs") or []}
    lost |= {rel for rel in state.get("hashes") or {}
             if SIDECAR_DIR in rel and rel not in placed}
    out += [{"kind": "attachment", "label": _attachment_name(root, rel),
             "tables": 0, "formulas": 0} for rel in sorted(lost)]
    return out


def _lost_block(lost):
    """F5's first block of `report.md`: what no unit could carry, in the owner's
    words and names — never a path, an id or a count of anything but files."""
    out, undated = [], 0
    for row in lost:
        if row["kind"] == "workbook":
            out.append(("بخشی از " if row.get("part") else "")
                       + f'فایل اکسل «{row["label"]}» ثبت نشد: {_fa(row["tables"])} '
                       f'جدول و {_fa(row["formulas"])} فرمول آن بررسی نشد.')
        elif row["kind"] == "recording" and row["label"]:
            out.append(f'بخشی از جلسهٔ «{row["label"]}» بررسی نشد.')
        elif row["kind"] == "recording":
            undated += 1
    out = list(dict.fromkeys(out))
    if undated:
        out.append(f"بخشی از {_fa(undated)} جلسهٔ دیگر بررسی نشد.")
    files = [r["label"] for r in lost if r["kind"] == "attachment"]
    photos = [f for f in files if f.lower().endswith(PHOTO_SUFFIXES)]
    if photos:
        out.append(f"{_fa(len(photos))} عکس فرم بررسی نشد.")
    if len(files) > len(photos):
        out.append(f"{_fa(len(files) - len(photos))} فایل پیوست بررسی نشد.")
    return out + [""] if out else []


def _store_held_block(run_dir):
    """F5 at the store gate: the entries `apply` held back (`held.json`) are
    named too — by the Persian title the delta gave them, else counted — so
    nothing waits unsaid. Never the engine's lines, a temp id or a path."""
    held = run_dir / "held.json"
    labels = [row.get("label") for row in (read_json(held) if held.exists() else [])
              if isinstance(row, dict)]
    if not labels:
        return []
    delta = run_dir / "facts-delta.json"
    entries = (read_json(delta).get("entries") or []) if delta.exists() else []
    titles = {}
    for entry in entries:
        if isinstance(entry, dict) and isinstance(entry.get("title"), str) \
                and entry["title"].strip():
            for name in ("key", "id"):
                if isinstance(entry.get(name), str):
                    titles[entry[name]] = entry["title"].strip()
    named = [titles[label] for label in labels if label in titles]
    line = f"{_fa(len(labels))} مورد به‌دلیل ایراد ساختاری ثبت نشد"
    if len(named) == len(labels):
        line += ": " + "، ".join(f"«{t}»" for t in named)
    return [line + ".", ""]


#: What a table's page lists under it, in the owner's words (spec 2026-09-16).
SUBSET_FA = {"rule": "قاعده", "measurement": "اندازه‌گیری", "note": "یادداشت"}


def _counted(counts):
    return "، ".join(f"{_fa(counts[kind])} {SUBSET_FA[kind]}"
                     for kind in HOMED_KINDS if counts[kind])


def _by_table_block(entries, titles, moved):
    """`report.md`'s placement block: what this run left under each table, what
    it left unattached, and the entries whose place it would have changed and
    did not (owner decision 1). Tables are named by their titles, never by an
    id (§2.7), and one this run cannot name at all is left out.

    `entries` is the store's own order, so the tables come out in it.
    """
    counts = {e["id"]: collections.Counter() for e in entries
              if e["kind"] == "record"}
    loose = collections.Counter()
    for entry in entries:
        if entry["kind"] not in HOMED_KINDS:
            continue
        ref = (entry.get("home") or {}).get("ref")
        if ref:
            counts.setdefault(ref, collections.Counter())[entry["kind"]] += 1
        else:
            loose[entry["kind"]] += 1
    out = [f"«{titles[ref]}»: {_counted(count)}"
           for ref, count in counts.items() if sum(count.values()) and ref in titles]
    if sum(loose.values()):
        out.append(f"بدون جدول: {_counted(loose)}")
    for row in moved:
        seen = titles.get(row.get("seen"))
        title = titles.get(row.get("id")) or row.get("title")
        if seen and title:
            out.append(f"جای «{title}» تغییر نکرد؛ این اجرا آن را زیر "
                       f"«{seen}» می‌دید.")
    return ["زیر هر جدول چه ثبت شد:"] + out + [""] if out else []


def gate_b(root, skeleton, entries, state):
    """`gate-b.md` (§2.7) — a finished Persian message the playbook sends
    verbatim. No id, no path, no code, no command; an entry is its title."""
    registry = read_json(pathlib.Path(root) / "departments" / "registry.json")
    name = next((d["name"] for d in registry["departments"]
                 if d["code"] == state["department"]), state["department"])
    counts = {kind: sum(1 for e in entries if e["kind"] == kind)
              for kind in KIND_ORDER}
    rules = [e for e in entries if e["kind"] == "rule"]
    disputes = _disputes(entries)
    unknown = sum(len(null_paths(e)) for e in entries)
    # An unread file is not an issue found *in* a file — it has its own block
    # below, and counting it here would name it twice.
    issues = [i for i in skeleton["issues"]
              if i["kind"] not in NOT_A_FILE_ISSUE]
    reasons = []
    for dropped in state["dropped"]:
        word = REASON_FA.get(dropped["reason_code"])
        if word and word not in reasons:
            reasons.append(word)
    out = [f"خلاصهٔ اعداد {name} — برای تأیید", "",
           f'ثبت می‌شود: {_fa(counts["rule"])} قاعده، {_fa(counts["record"])} '
           f'جدول، {_fa(counts["measurement"])} اندازه‌گیری، '
           f'{_fa(counts["note"])} یادداشت.',
           f'کنار گذاشته شد: {_fa(len(state["dropped"]))} مورد'
           + (f' ({"، ".join(reasons[:3])})' if reasons else "")
           + " — فهرست کامل در گزارش پایان اجرا.",
           f'بررسی‌نشده: {_fa(len(state["undecided"]))} مورد.', ""]
    if rules:
        out.append("قاعده‌ها:")
        out += [_rule_line(r) for r in rules[:3]]
        if len(rules) > 3:
            out.append(f"  … ({_fa(len(rules) - 3)} مورد دیگر)")
        out.append("")
    if disputes:
        out.append(f"اختلاف بین دو منبع: {_fa(len(disputes))} مورد "
                   "(در پنل هم قابل تعیین تکلیف است)")
        for n, (entry, sides) in enumerate(disputes, start=1):
            out.append(f'  {_fa(n)} — «{entry["title"]}»: '
                       + "  ".join(f'{letter}) {_fa(side["value"])}'
                                   for letter, side in zip(LETTERS_FA, sides)))
        out.append("")
    if issues:
        # The design's line says «سه مورد مهم», which a run with one issue
        # printed over a single bullet. The count is what is true: the whole
        # list when it fits, and how many of it are shown when it does not.
        shown = issues[:3]
        out.append(f"ایرادهای یافته‌شده در فایل‌ها: {_fa(len(issues))} مورد"
                   + (f" — {_fa(len(shown))} مورد از آن‌ها:"
                      if len(issues) > len(shown) else ":"))
        out += [f'  • {i["description"]}' for i in shown]
        out.append("")
    out += _held_back_blocks(state["undecided"], ("oversized",), "  • ")
    out += _unread_block(root, state["department"], skeleton["issues"])
    out += [f"بی‌پاسخ: {_fa(unknown)} خانه — در پنل.", "", "تأیید می‌کنید؟", ""]
    return "\n".join(out)


def report(root, run_dir):
    """`report.md` (§2.7) — written after `apply`, from `assembly.json`, the
    run's `id-map.json` and the store. Every entry is named by its Persian
    title; the disputes are lettered so the owner can answer «۱ الف» and the
    playbook runs `merge facts resolve` itself."""
    root, run_dir = pathlib.Path(root), pathlib.Path(run_dir)
    skeleton = read_json(run_dir / "skeleton.json")
    assembly = read_json(run_dir / "assembly.json")
    id_map = read_json(run_dir / "id-map.json")
    registry = read_json(root / "departments" / "registry.json")
    name = next((d["name"] for d in registry["departments"]
                 if d["code"] == skeleton["department"]), skeleton["department"])
    store = load_store(root)
    # `apply` writes `touched.json`: every entry the run changed and left open,
    # merges included. `id-map.json` holds only the ids it minted, so a run
    # that only merged would name nothing here — the fallback is for run
    # directories written before `touched.json` existed. Membership is the
    # whole filter: what belongs in it was decided where it was written.
    footprint = run_dir / "touched.json"
    touched = set(read_json(footprint) if footprint.exists() else id_map.values())
    entries = [e for kind in KIND_ORDER for e in store[kind]["entries"]
               if e["id"] in touched]

    disputes = _disputes(entries)
    unknown = [(e, null_paths(e)) for e in entries]
    unknown = [(e, p) for e, p in unknown if p]

    # A `moved-home.json` id `apply` could not name is named off the store
    # here, and `report` prints no line it cannot name (owner decision 1).
    titles = {e["id"]: e["title"] for kind in KIND_ORDER
              for e in store[kind]["entries"]
              if isinstance(e.get("title"), str) and e["title"].strip()}
    moved = run_dir / "moved-home.json"
    out = [f"گزارش پایان اجرا — {name}", ""] \
        + _lost_block(assembly.get("lost_sources") or []) + [
           f'ثبت شد: {_fa(len(entries))} مورد. '
           f'کنار گذاشته شد: {_fa(len(assembly["dropped"]))} مورد. '
           f'{_fa(len(assembly["undecided"]))} مورد بررسی‌نشده.', ""] \
        + _by_table_block(entries, titles,
                          read_json(moved) if moved.exists() else [])
    if disputes:
        out.append("اختلاف‌ها — شمارهٔ مورد و حرف گزینه را بفرستید، مثلاً «۱ الف»:")
        for n, (entry, accounts) in enumerate(disputes, start=1):
            out.append(f'اختلاف {_fa(n)} — «{entry["title"]}»')
            for letter, account in zip(LETTERS_FA, accounts):
                out.append(f'  {letter}) {account["statement"]}')
        out.append("")
    if unknown:
        out.append(f"خانه‌های بی‌پاسخ ({_fa(sum(len(p) for _e, p in unknown))} "
                   "مورد) — همه در پنل قابل تکمیل‌اند:")
        out += [f'  • «{entry["title"]}»: {_fa(len(paths))} خانه'
                for entry, paths in unknown[:10]]
        out.append("")
    if assembly["dropped"]:
        out.append("چه چیزهایی ثبت نشد:")
        counted = {}
        for row in assembly["dropped"]:
            counted[row["reason_code"]] = counted.get(row["reason_code"], 0) + 1
        out += [f'  • {REASON_FA.get(code, REASON_FA["other"])}: {_fa(n)} مورد'
                for code, n in sorted(counted.items())]
        out.append("")
    # Owner ruling, 2026-09-09: the file problems do not go in the message.
    # A broken formula in L13:L14, a column that moved between two copies of a
    # tab, a cell that only mirrors another — the owner cannot act on any of it
    # from a chat message, and forty such lines buried the three things they
    # can act on. Every one of them is still attached to the entry it concerns
    # and drawn in the panel (`IssuesCard`), still counted in `gate-b.md` as
    # the run's own record, and still `merge facts audit`'s to report.
    out += _store_held_block(run_dir)
    out += _unread_block(root, skeleton["department"], skeleton["issues"])
    if assembly["undecided"]:
        out.append("چه چیزهایی بررسی نشد و در اجرای بعدی تکمیل می‌شود:")
        out += _held_back_blocks(assembly["undecided"], UNDECIDED_FA, "    • ")
        out.append(f'{_fa(len(assembly["undecided"]))} مورد در این اجرا بررسی '
                   "نشد و در اجرای بعدی تکمیل می‌شود.")
    # R9 — a review is never dropped whole any more, so «انجام نشد» is gone:
    # either it ran, or (engine-only) it was never asked for. A `partial` run
    # names each decision it held back, by the entry's own title and the
    # owner's words for the reason — never the engine's `lines`, which are an
    # `n`, a field path and a code.
    held = assembly.get("review_held") or []
    status = assembly["review_status"]
    if status == "partial" and held:
        out.append(f"بازبینی انجام شد؛ {_fa(len(held))} تصمیم آن کنار گذاشته شد:")
        out += [f'  • «{row["label"]}» — '
                f'{REVIEW_HELD_FA.get(row["reason"], REVIEW_HELD_FA["refused"])}'
                for row in held]
    else:
        out.append({"applied": "بازبینی انجام شد.",
                    "partial": "بازبینی انجام شد.",
                    "absent": "بازبینی اجرا نشد."}[status])
    path = run_dir / "report.md"
    write_text_atomic(path, "\n".join(out) + "\n")
    return path
