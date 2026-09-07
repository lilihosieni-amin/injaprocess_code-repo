"""`facts-plan digest | assemble | report` (§2.6, §2.7), and the `facts-unit`
content pass.

A unit's output is checked the moment it returns (QF-51), by the same rules
`assemble` will later rely on — a document that passes here is one `assemble`
can fold in without asking the model anything twice.

The verbs land here as the tasks that implement them do; `cli.py` reports a
verb whose function is not here yet rather than failing to import.
"""
import copy
import hashlib
import json
import pathlib
import re
import sys

from engine_common import (read_json, validate, write_json_atomic,
                           write_text_atomic)
from merge_facts import (KIND_ORDER, _sheet_identities, canonical_scope,
                         iter_ref_objects, load_store, null_paths, set_path)
from merge_facts.audit import flags_over
from merge_facts.content import _check_prose, check_document
from merge_facts.preconditions import _registered, _unit_symbols

from facts_plan.build import estimate_tokens, label_of, process_index

#: A template field the record unit has not renamed yet — §2.5's `c_h`. The
#: `c_` prefix is what marks a ref provisional, so a field wearing it in any
#: case is held to the grammar; anything else is a minted key.
PROVISIONAL_FIELD = re.compile(r"^c_[a-z]{1,3}$")
REVIEW_DECISIONS, REVIEW_REWRITES = 60, 20


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


def _review_caps(doc):
    """§2.6's two caps on a review document. The schema carries the first one
    too, but its `maxItems` message is the whole 61-decision instance dumped
    into one line — §4 asks for a line a reviewer can read, so this runs
    before the schema and speaks for it."""
    out = []
    decisions = doc.get("decisions") or []
    if len(decisions) > REVIEW_DECISIONS:
        out.append(f"review: {len(decisions)} decisions, "
                   f"at most {REVIEW_DECISIONS} (§2.6)")
    rewrites = [d for d in decisions if isinstance(d, dict)
                and d.get("action") == "keep" and d.get("statement")]
    if len(rewrites) > REVIEW_REWRITES:
        out.append(f"review: {len(rewrites)} statement rewrites, "
                   f"at most {REVIEW_REWRITES} (§2.6)")
    return out


def validate_unit(root, run_dir, path):
    """Every message for one `facts-unit` document, empty when it may pass.

    Checks, in order: the review's two caps; the schema; the `units/<id>/`
    directory the document sits in against the `unit` it declares, and every
    candidate of **that** unit's `plan.json` list decided exactly once (a plan
    unit only — the review addresses assembled entries, which do not exist
    yet); `S-` refs naming a candidate of this run; node ids in the
    department's **whole** process index, in `decisions[]` and `new[]` alike;
    the provisional field grammar; the §5.2 lint on every prose field with
    `skeleton.json`'s `unit_symbols[]` exempted; and a `unit` written onto a
    field that is not a number.
    """
    root, run_dir, path = pathlib.Path(root), pathlib.Path(run_dir), pathlib.Path(path)
    # §3.5 — two attempts per unit is a rule of the engine. The 2026-09-07 run
    # reached out.3.json and then asked the owner to lift the cap; `unit_states`
    # and `_outputs` already read a third attempt as `failed`, they were only
    # never told why.
    attempt = re.fullmatch(r"out\.([0-9]+)\.json", path.name)
    if attempt and int(attempt.group(1)) > ATTEMPTS:
        return [f"{path.name}: attempt cap: two per run"]
    try:
        doc = read_json(path)
    except (OSError, ValueError) as exc:
        return [f"{path.name}: not readable as JSON ({exc})"]
    caps = _review_caps(doc) if isinstance(doc, dict) \
        and doc.get("unit") == "review" else []
    # The schema carries the 60 cap too, and its `maxItems` message is the
    # whole decisions array on one line (§4). Checking the trimmed document
    # keeps that line out and every other schema error in.
    checked = dict(doc, decisions=doc["decisions"][:REVIEW_DECISIONS]) if caps else doc
    try:
        validate("facts-unit.schema.json", checked)
    except ValueError as exc:
        return caps + [str(exc)]

    skeleton = read_json(run_dir / "skeleton.json")
    plan = read_json(run_dir / "plan.json")
    # The candidate's store kind, not just its id: `_lint_decision` needs it to
    # know whose `statement` may name a column (QF-50).
    candidates = {c["id"]: c for c in skeleton["candidates"]}
    kinds = {cid: KIND_OF.get(c["kind"], c["kind"])
             for cid, c in candidates.items()}
    known = set(kinds)
    symbols = skeleton.get("unit_symbols") or []
    nodes = process_index(root, skeleton["department"])
    node_ids = {f'{n["process"]}::{n["node"]}' for n in nodes} \
        | {f'{n["process"]}::{n["node"].rsplit("-", 1)[-1]}' for n in nodes}
    problems, seen, unit = list(caps), [], None
    in_units = path.parent.parent.name == "units"
    if doc["unit"] == "review":
        # A review lives at `review/out.json` and addresses assembled entries.
        # One written into a unit's directory used to skip both checks below —
        # so the unit went `done` having decided none of its candidates, and
        # `assemble` sent every one of them to `undecided[]`.
        if in_units:
            problems.append(f'{path.name}: is a review document, but it sits in '
                            f'units/{path.parent.name}/, whose candidates it '
                            "decides none of")
    else:
        # A document belongs to the unit whose directory it sits in, never to
        # the one it names: a document declaring a zero-candidate sibling would
        # otherwise decide nothing and still be `done`.
        dir_unit = path.parent.name if in_units else None
        unit = next((u for u in plan["units"] if u["id"] == dir_unit), None)
        if not in_units:
            problems.append(f"{path.name}: is in no units/<unit id>/ directory of "
                            "the run, so no plan entry says what it must decide")
        elif unit is None:
            problems.append(f"{path.name}: {dir_unit} is no unit of this run's plan")
        elif doc["unit"] != dir_unit:
            problems.append(f'{path.name}: unit {doc["unit"]} does not match its '
                            f"directory {dir_unit}")

    for n, decision in enumerate(doc["decisions"]):
        entry = decision.get("entry") or {}
        label = f'decisions[{n}] ' + (decision.get("skeleton")
                                      or f'{entry.get("kind")}/{entry.get("key")}')
        skid = decision.get("skeleton")
        if skid:
            if skid not in known:
                problems.append(f"{label}: {skid} is not a candidate of this run")
            elif skid in seen:
                problems.append(f"{label}: {skid} is decided twice")
            seen.append(skid)
        for ref in _refs(decision):
            target = ref.get("ref")
            if isinstance(target, str) and target.startswith("S-") \
                    and target not in known:
                problems.append(f"{label}: ref {target} names no candidate")
            field = ref.get("field")
            if isinstance(field, str) and field[:2].lower() == "c_" \
                    and not PROVISIONAL_FIELD.match(field):
                problems.append(f"{label}: provisional field {field!r} is not "
                                "c_<column letter, lowercase>")
        problems += _citations(decision, label, node_ids, skeleton["department"])
        # `_rename_fields` walks the candidate's MECHANICAL columns and merges
        # what the unit wrote onto them, so a member whose `from` names no such
        # column is dropped without a word — the unit's work simply vanished
        # between its gate and the delta. `_entry` cannot raise (`assemble` runs
        # it too, over documents already gated); the refusal belongs here.
        columns = {f.get("key") for f in
                   _members(candidates.get(skid, {}).get("payload") or {}, "fields")}
        for i, field in enumerate((decision.get("data") or {}).get("fields") or []):
            written = isinstance(field, dict) and field.get("from")
            if skid and written and written not in columns:
                problems.append(f"{label}: data.fields[{i}].from: {written!r} "
                                "names no column of this candidate")
        for field in _members(decision.get("data") or {}, "fields"):
            if field.get("unit") and field.get("type") not in (None, "number"):
                problems.append(f'{label}: field {field.get("key")} is '
                                f'{field.get("type")} and carries a unit')
        problems += _lint_decision(decision, label, symbols,
                                   kinds.get(skid) or entry.get("kind"))

    for n, entry in enumerate(doc.get("new") or []):
        label = f'new[{n}] {entry.get("key")}'
        problems += _citations(entry, label, node_ids, skeleton["department"]) \
            + _lint_decision(entry, label, symbols, entry.get("kind"))

    if unit is not None:
        for cid in unit["candidates"]:
            if cid not in seen:
                problems.append(f'{unit["id"]}: {cid} has no decision')

    # I1 (§3.1) — the output side closes here. Whatever the unit wrote, from
    # whatever evidence, is held to the contract `merge facts apply` enforces:
    # the store schema per kind, then the content pass. A per-entry refusal
    # after this point is a defect, not a finding.
    #
    # The review is not materialised here: it decides assembled entries, which
    # do not exist until `assemble` has run — `_lint_entries` gates it there.
    # Everything else is gated whatever else was found, so a unit spends one
    # attempt on the whole list rather than one attempt per class of mistake.
    if doc["unit"] != "review":
        problems += _gate(root, run_dir, doc)
    # The decision lint and the content pass walk the same prose leaves and now
    # say the same words about them, so the same nit lands twice.
    return list(dict.fromkeys(problems))


def _gate(root, run_dir, doc):
    """§3.1 steps 2–3 over the materialised entries, under the labels the unit's
    other messages already use."""
    skeleton = read_json(pathlib.Path(run_dir) / "skeleton.json")
    entries = materialise(root, run_dir, doc)
    labels = _unit_labels(doc)
    named = [labels.get(e["_skeleton"], e["_skeleton"]) for e in entries]
    return _contract_problems(root, entries, named,
                              skeleton.get("unit_symbols") or [])


def _contract_problems(root, entries, named, symbols):
    """The whole per-entry contract `merge facts apply` enforces, over entries
    something has already materialised: the store schema per kind, the two
    `preconditions` checks that live OUTSIDE the content pass (a branch code
    off the sheets manifest, a unit symbol off the run's list), then
    `check_document` itself. `named[i]` is what entry `i` is reported under — a
    decision at the unit's gate, `<unit>: <key>` at the assembly — so no message
    ever cites the temp id the writer never saw.
    """
    clean = [{k: v for k, v in e.items() if not k.startswith("_")} for e in entries]
    delta = {"schema_version": 2, "entries": clean}
    out = []
    try:
        validate("facts-delta.schema.json", delta)
    except ValueError as exc:
        # `entries[3].data.fields[2].type: …` → `decisions[1] S-…: data.…`, so
        # the unit is told which of ITS decisions to go back to (§3.1 step 2).
        for line in str(exc).splitlines()[1:]:
            out.append(_renamed(line, named))
    # QF-33/QF-40. A bare test estate has no manifest and a fresh run may have
    # no declared symbols; an empty list there means "nothing to check against",
    # never "everything is wrong".
    branches = _registered(pathlib.Path(root) / "attachments" / "sheets" /
                           "manifest.json", "branches")
    for entry, label in zip(clean, named):
        for n, branch in enumerate(entry["scope"]["branches"]):
            if branches and branch not in branches:
                out.append(f"{label}: scope.branches[{n}]: branch {branch!r} is "
                           "not in the sheets manifest")
        for symbol in _unit_symbols(entry) if symbols else ():
            if symbol not in symbols:
                out.append(f"{label}: unit {symbol!r} is declared by no row of "
                           "the units record")
    # A `calls[]` ref this document could not resolve is `T-0`, so `_call_keys`
    # rescues nothing and every identifier that call declares reads as
    # undeclared. Cross-unit resolution is `_resolve_refs`' job — skip the expr
    # line here the way `_check_unit_edges` skips a target it cannot see.
    blind = {e["id"] for e in clean
             if any(isinstance(c, dict) and c.get("ref") == "T-0"
                    for c in (e["data"].get("calls") or []))}
    # `check_document` labels a message with the entry's id, and the temp ids
    # here are minted for the validation and nowhere else — `T-1` names nothing
    # the writer ever wrote. Same rename as above, on the label instead of a path.
    by_temp = dict(zip((e["id"] for e in clean), named))
    for message in check_document(delta, "facts-delta", load_store(root),
                                  unit_symbols=symbols):
        head, sep, tail = message.partition(": ")
        if head in blind and tail.startswith("expr identifier "):
            continue
        out.append(f"{by_temp.get(head, head)}{sep}{tail}")
    return out


#: `entries[3]` / `entries[N]` at the head of a §3.4 line, and the concrete
#: paths inside its `(n places: …)` tail.
_ENTRY_AT = re.compile(r"entries\[([0-9]+|N)\]")


def _renamed(line, named):
    """§3.4's line with every `entries[<i>]` replaced by the decision that wrote
    it. `entries[N]` — the generalised head of a grouped line — has no one
    decision, so it keeps its shape and the `(n places: …)` tail names them."""
    def swap(match):
        n = match.group(1)
        return f"{named[int(n)]}:" if n != "N" and int(n) < len(named) else "entries[N]"
    return _ENTRY_AT.sub(swap, line).replace(":.", ": ")


def _citations(entry, label, node_ids, department):
    """§2.5 — a `processes[]` node id not in the department's index is an
    error, wherever the citation sits."""
    return [f'{label}: node {c["node"]} is in no process of {department}'
            for c in entry.get("processes") or []
            if f'{c["process"]}::{c["node"]}' not in node_ids]


def _members(data, key):
    """`data[key]`'s dict members. The payload vocabulary is open leaves, so a
    unit may write a list of bare strings where members are expected — a shape
    the lint skips rather than dies on."""
    value = data.get(key)
    return [m for m in value if isinstance(m, dict)] if isinstance(value, list) else []


def _lint_decision(decision, label, symbols, kind=None):
    """§5.2 at unit level (QF-50) — the unit that wrote a failing sentence is
    the one that fixes it, which is only true while the decision is still
    addressable by its own index.

    `kind` is the store kind the decision lands as, and it decides one rule:
    «ستون»/«تب»/«سلول» belong in a **record's** own `statement`, which is what
    `content._check_prose` allows at Stage V and what the style card and the
    unit's own card ask for. A title is strict whatever the kind.

    It IS `content._check_prose`, read over the decision as the entry it
    becomes: the leaves are the same leaves, and a hand copy of them said the
    same nit in different words («title: carries …» against «title carries …»),
    which `group_messages` cannot fold — so the gate reported one mistake twice.
    """
    out = []
    parts = decision.get("into") if decision.get("action") == "split" else [decision]
    for part in parts or []:
        data = part.get("data") or {}
        _check_prose({**part, "kind": kind,
                      # A decision carries its issues under `data`; an assembled
                      # entry carries them at the top, where `_check_prose` looks.
                      "issues": part.get("issues") or data.get("issues") or []},
                     symbols, out, label)
    return out


# --------------------------------------------------------------------------
# T15 step 0 (§2.6): the units' documents, the review folded onto them, and
# the two shapes every later step reads — the `(kind, key, scope)` address and
# the `{value, inferred}` wrapper the model writes on a leaf.

#: A candidate's kind as the store spells it — a `.gs` script is a rule; a
#: `new[]` entry already names a store kind, so it passes through.
KIND_OF = {"record": "record", "item": "item", "rule": "rule", "script": "rule",
           "gs": "rule"}
_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")

#: A dispute's sides, lettered — the owner answers «۱ الف» (§2.7), so
#: `gate-b.md` and `report.md` letter one list the same way.
LETTERS_FA = ("الف", "ب", "ج", "د")

#: §2.3's two attempts per unit — a unit that has used both is `failed`, and
#: its candidates go to `undecided[]` rather than blocking the assembly.
ATTEMPTS = 2

#: §2.6's ceiling on the reviewer's input — one unit's budget, spent on the
#: whole run at once.
DIGEST_CEILING = 50000

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
            "reference_tab_computes": "تب مرجع فرمول دارد"}

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


def _address(entry):
    """`(kind, key, canonical scope)` — how the review addresses an assembled
    entry, and how two units are found to have minted the same one (§2.6)."""
    return (entry["kind"], entry["key"],
            json.dumps(canonical_scope(entry.get("scope")), sort_keys=True))


def _outputs(root, run_dir, plan):
    """`[(unit, path, doc)]` for the units that returned something usable, in
    ascending unit id — the only order `assemble` has, and the reason it is
    deterministic.

    A latest attempt that is present and does not validate is refused here,
    naming the unit: QF-51 checks a document the moment it returns, and one
    nobody has fixed since must not be folded in silently. The exception is the
    unit that has spent both its attempts — that is the `failed` unit step 5
    sends to `undecided[]`, and the run finishes without it.
    """
    out, problems = [], []
    for unit in sorted(plan["units"], key=lambda u: u["id"]):
        attempts = sorted((run_dir / "units" / unit["id"]).glob("out.*.json"))
        for path in reversed(attempts):
            try:
                doc = read_json(path)
            except (OSError, ValueError):
                continue
            found = validate_unit(root, run_dir, path)
            if not found:
                out.append((unit, path, doc))
            elif len(attempts) < ATTEMPTS:
                problems += [f'{unit["id"]}: {message}' for message in found]
            break
    if problems:
        for line in problems:
            print(f"facts-plan: {line}", file=sys.stderr)
        raise SystemExit(2)
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
                   if k in ("key", "title", "statement", "aliases", "branches",
                            "processes")}}
    return handle, candidate, decision


def _collect(root, run_dir, plan, skeleton):
    """The units' decisions keyed by skeleton id, their `new[]` entries as
    candidates of their own, and the units that returned nothing usable."""
    state = {"by_skeleton": {}, "new": [], "failed": set(),
             "review_status": "absent", "dropped": [], "undecided": [],
             "provenance": {}, "flags": []}
    returned = set()
    for unit, _path, doc in _outputs(root, run_dir, plan):
        returned.add(unit["id"])
        for decision in doc["decisions"]:
            state["by_skeleton"][decision["skeleton"]] = dict(decision,
                                                              unit=unit["id"])
        for n, entry in enumerate(doc.get("new") or []):
            handle, candidate, decision = _pseudo(entry, unit["id"], n)
            state["new"].append(candidate)
            state["by_skeleton"][handle] = decision
    state["failed"] = {u["id"] for u in plan["units"] if u["id"] not in returned}
    return state


def _fold_review(run_dir, state, draft, scratch):
    """Step 0 (§2.6). The digest hash must still match the assembly the reviewer
    read, and an address hitting zero or more than one entry discards the whole
    document: one round, no negotiation (§10)."""
    path = run_dir / "review" / "out.json"
    stamp = run_dir / "review" / "input.sha256"
    if not path.is_file() or not stamp.is_file():
        return "absent"
    text = _digest_text(scratch, draft)
    if stamp.read_text(encoding="utf-8").strip() != \
            hashlib.sha256(text.encode("utf-8")).hexdigest():
        return "discarded"
    doc = read_json(path)
    address = {}
    for entry in draft:
        address.setdefault(_address(entry), []).append(entry)
    folded, settled = [], []
    for decision in doc["decisions"]:
        if decision.get("action") == "contradiction":
            # The fifth action, `review`-only: the reviewer settles a
            # `unit_drift` the cross-unit pass flagged — `fix` writes the leaf,
            # `account` keeps both readings open for the owner. It settles a
            # record rather than deciding a candidate, so it never joins
            # `folded`: merged onto a decision it would replace the `keep` and
            # the entry would leave the delta altogether. The flags are the
            # ones `scratch` carries, which are the ones `review/input.md` was
            # rendered from — a field none of them names is an address the
            # reviewer invented, and an invented address discards the whole
            # document (QF-52).
            addr = _address(decision["entry"]) if decision.get("entry") else None
            flag = next((f for f in scratch["flags"]
                         if f["code"] == "unit_drift"
                         and f["field"] == decision["field"]
                         and _address(f["entry"]) == addr), None)
            if flag is None:
                return "discarded"
            settled.append((flag, decision))
            continue
        # `into` may be an address too (`facts-unit.schema.json`'s `entryAddr`),
        # and `_target_of` walks skeleton ids — so it is resolved here or the
        # document is discarded, never handed on as a dict nothing can follow.
        if isinstance(decision.get("into"), dict):
            target = address.get(_address(decision["into"]), [])
            if len(target) != 1:
                return "discarded"
            decision = dict(decision, into=target[0]["_skeleton"])
        if decision.get("skeleton"):
            # A skeleton no unit decided is an address the reviewer invented:
            # folding it would report `applied` for a decision that lands
            # nowhere. (A *dropped* candidate is decided, so §2.6's reinstating
            # `keep` still works.)
            if decision["skeleton"] not in state["by_skeleton"]:
                return "discarded"
            folded.append(decision)
            continue
        hit = address.get(_address(decision["entry"]), [])
        if len(hit) != 1:
            return "discarded"
        folded.append(dict(decision, skeleton=hit[0]["_skeleton"]))
    for decision in folded:
        previous = state["by_skeleton"].get(decision["skeleton"], {})
        merged = {**previous, **{k: v for k, v in decision.items()
                                 if v is not None}}
        merged["unit"] = previous.get("unit", "review")
        state["by_skeleton"][decision["skeleton"]] = merged
    state["settled"] = settled
    # Whose mistake a refused entry is: the reviewer rewrote this one, so
    # `_lint_entries` names the review rather than the unit it came from.
    state["reviewed"] = {decision["skeleton"] for decision in folded}
    return "applied"


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
    if "/attachments/.text/" in rel:
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


def _entry(candidate, decision, state, part=None):
    """Step 2 — the envelope §2.6 describes: the skeleton's mechanical payload
    under the unit's own fields, `source[]` from every instance and binding,
    `scope` per §3.2, the `inferred` wrappers expanded into `field_status`."""
    written = part or decision
    status = {}
    data = copy.deepcopy(candidate["payload"])
    given = _unwrap(written.get("data") or {}, "data", status)
    renames, fields = _rename_fields(data.pop("fields", []),
                                     given.pop("fields", []))
    data.update(given)
    if fields:
        data["fields"] = fields
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
    # The citations hang off the decision, never off a split part (§2.5's
    # `splitPart` has no `processes`), so both parts of a split inherit them.
    sources += _process_sources(decision, state["department"])
    entry = {"kind": KIND_OF.get(candidate["kind"], candidate["kind"]),
             "key": written["key"],
             "title": written["title"], "statement": written["statement"],
             "scope": _scope_of(candidate, state["department"], decision,
                                state["candidates"]),
             "source": sources
             or _unit_sources(state["units"].get(decision["unit"])),
             "retired": False, "data": data,
             "_skeleton": candidate["id"], "_unit": decision["unit"],
             "_renames": renames}
    if written.get("aliases"):
        entry["aliases"] = written["aliases"]
    if status:
        entry["field_status"] = status
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
    a keyed member the target already carries is left alone (§11's union)."""
    for collection in ("applies_to", "instances"):
        held = {m["key"] for m in target["data"].get(collection) or []}
        for member in candidate["payload"].get(collection) or []:
            if member["key"] not in held:
                target["data"].setdefault(collection, []).append(member)


def _target_of(state, skid):
    """`merge_into` to a fixpoint, ascending (unit id, skeleton id) — a cycle
    is an error naming both units."""
    seen = []
    while True:
        decision = state["by_skeleton"].get(skid)
        if not decision or decision["action"] != "merge_into":
            return skid
        if skid in seen:
            raise _fail(f'{skid}: merge_into cycle across units '
                        f'{", ".join(sorted({state["by_skeleton"][s]["unit"] for s in seen}))}')
        seen.append(skid)
        skid = decision["into"]


def _fail(message):
    print(f"facts-plan: {message}", file=sys.stderr)
    return SystemExit(2)


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
    for cid, candidate in sorted(by_id.items()):
        decision = state["by_skeleton"].get(cid)
        label = label_of(candidate)
        if decision is None or candidate.get("unit") in state["failed"]:
            state["undecided"].append({"skeleton": cid, "kind": candidate["kind"],
                                       "label": label,
                                       "unit": candidate.get("unit")})
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
        if decision.get("skeleton"):
            by_skeleton[decision["skeleton"]] = dict(decision, unit=unit)
    for n, entry in enumerate(doc.get("new") or []):
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
           for n, entry in enumerate(doc.get("new") or [])}
    for n, decision in enumerate(doc["decisions"]):
        if decision.get("skeleton"):
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
    for cid in sorted(state["by_skeleton"],
                      key=lambda k: (state["by_skeleton"][k]["unit"], k)):
        decision = state["by_skeleton"][cid]
        if decision["action"] != "merge_into":
            continue
        target = _target_of(state, cid)
        if target not in kept:
            raise _fail(f'{cid} (unit {decision["unit"]}) merges into {target} '
                        f'(unit {(by_id.get(target) or {}).get("unit", "?")}), '
                        "which no unit kept")
        _absorb(kept[target], by_id[cid])
    entries = list(kept.values())
    entries.sort(key=lambda e: (KIND_ORDER.index(e["kind"]),
                                e["_skeleton"], e["key"]))
    for n, entry in enumerate(entries, start=1):
        entry["id"] = f"T-{n}"
        state["provenance"][entry["id"]] = entry["_unit"]
    _resolve_refs(entries, state)
    by_temp = {e["id"]: e for e in entries}
    _attach_scopes(entries, state, by_temp)
    for entry in entries:
        if entry["kind"] == "note":
            entry["key"] = _note_key(entry, by_temp)
    return entries


def _resolve_refs(entries, state):
    """1a and 1b in one walk: an `S-` ref becomes the temp id of that
    candidate's kept entry, an `F-` ref is checked against the store, and a
    provisional field key is rewritten to the one the record decision minted.
    An `imports[].source` whose target was dropped falls back to its locator;
    anything else naming a dropped or failed candidate is an error naming both
    units.

    An `N-<unit>-<n>` handle — the one §2.6 step 6 gives a `new[]` entry —
    resolves exactly as an `S-` id does, so a unit can mint an entity and point
    at it in the same run: a record's `movement` ends are `place` items, and
    nothing in the sheets mints those.
    """
    by_skeleton = {e["_skeleton"]: e for e in entries if e["_skeleton"]}
    dropped = {d["skeleton"]: d["unit"] for d in state["dropped"]}
    for entry in entries:
        for source in (member.get("source")
                       for instance in entry["data"].get("instances") or []
                       for member in instance.get("imports") or []):
            ref = (source or {}).get("ref")
            if isinstance(ref, str) and ref.startswith("S-") \
                    and ref not in by_skeleton:
                source.pop("ref", None)
                source.update(state["locators"].get(ref, {}))
        for obj in iter_ref_objects(entry):
            ref = obj.get("ref")
            if not isinstance(ref, str):
                continue
            if ref.startswith(("S-", "N-")):
                target = by_skeleton.get(ref)
                if target is None:
                    # Dropped, or left undecided by a unit that never returned
                    # — either way §2.6 wants both units named, so the owning
                    # candidate answers when `dropped[]` cannot.
                    owner = dropped.get(ref) \
                        or (state["candidates"].get(ref) or {}).get("unit") or "?"
                    raise _fail(f'{entry["_unit"]}: ref {ref} names a candidate '
                                f'unit {owner} did not keep')
                obj["ref"] = target["id"]
                if obj.get("field") in (target.get("_renames") or {}):
                    obj["field"] = target["_renames"][obj["field"]]
            elif ref.startswith("F-") and ref not in state["store_scopes"]:
                raise _fail(f'{entry["_unit"]}: ref {ref} is in no store entry')


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
    flags += _template_split(survivors) + _wrapper_variants(survivors, state)
    flags += flags_over(root, [{k: v for k, v in e.items()
                                if not k.startswith("_")} for e in survivors])
    state["flags"] = flags


def _lint_entries(root, entries, symbols, reviewed=()):
    """Step 8 — the §5.2 lint AND the store contract over every finished entry;
    a failure is refused, never stored, and the message names who wrote it.

    An assembled entry has a decision's shape where the lint looks (title,
    statement, aliases, `data`), so this is QF-51's own pass run once more over
    what the delta would carry: the same surface, which is what makes it a real
    gate for the one document no unit pass ever saw — the review's. Ruling 5:
    the shape half is that document's gate too, which is why `_contract_problems`
    runs here and not only at `validate_unit`."""
    named = [f'review: {entry["key"]}' if entry["_skeleton"] in reviewed
             else f'{entry["_unit"]}: {entry["key"]}' for entry in entries]
    out = [message for entry, label in zip(entries, named)
           for message in _lint_decision(entry, label, symbols,
                                         entry.get("kind"))]
    out += _contract_problems(root, entries, named, symbols)
    return list(dict.fromkeys(out))


def _digest_text(state, entries):
    """`review/input.md` (§2.6) — one line per assembled entry, the flags, and
    the dropped candidates with their reason codes."""
    lines = ["# digest",
             f"decisions ≤ {REVIEW_DECISIONS}, statement rewrites ≤ "
             f"{REVIEW_REWRITES}", "", "## entries", ""]
    for entry in entries:
        data = entry["data"]
        tail = {"rule": f'expr: {data.get("expr")}',
                "record": "fields: " + "، ".join(
                    f'{f["key"]}[{f.get("unit") or "—"}]'
                    for f in data.get("fields") or []),
                "item": f'{data.get("code")} · {data.get("unit")} · '
                        f'{data.get("category")}'}.get(entry["kind"], "")
        lines.append(" · ".join([entry["kind"], entry["key"],
                                 _address(entry)[2], entry["title"],
                                 entry["statement"], tail]))
    lines += ["", "## flags", ""]
    lines += [f'{f["code"]} · {f["id"]} · {f["message"]}'
              for f in state["flags"]] or ["—"]
    lines += ["", "## dropped", ""]
    lines += [f'{d["skeleton"]} · {d["kind"]} · {d["label"]} · {d["reason_code"]}'
              for d in state["dropped"]] or ["—"]
    return "\n".join(lines) + "\n"


def _prepare(root, run_dir, review):
    """Everything both verbs share: the run's files, the store, and the units'
    decisions with the review folded in when asked for."""
    run_dir = pathlib.Path(run_dir)
    skeleton = read_json(run_dir / "skeleton.json")
    plan = read_json(run_dir / "plan.json")
    manifest = read_json(pathlib.Path(root) / "attachments" / "sheets" /
                         "manifest.json")
    store = load_store(root)
    state = _collect(root, run_dir, plan, skeleton)
    state.update({
        "department": skeleton["department"], "issues": skeleton["issues"],
        "units": {u["id"]: u for u in plan["units"]},
        "paths": {w["spreadsheetId"]: f'attachments/sheets/{w["dir"]}/{w["file"]}'
                  for w in manifest["workbooks"]},
        "locators": {i["source"].get("ref"): {k: v for k, v in i["source"].items()
                                              if k != "ref"}
                     for i in skeleton["imports"] if i["source"].get("ref")},
        # Both halves of what the store answers here: whether an `F-` ref
        # exists (1a) and where its entry sits (§3.2's attachment union).
        "store_scopes": {e["id"]: canonical_scope(e.get("scope"))
                         for kind in KIND_ORDER
                         for e in store[kind]["entries"]}})
    if review:
        # The reviewer read the assembly as it stood *before* the review, flags
        # and all — so the hash is checked against that same document, rebuilt
        # here on a copy nothing folded in can touch.
        scratch = copy.deepcopy(state)
        draft = _build_entries(root, skeleton, scratch)
        _cross_unit(root, draft, scratch)
        state["review_status"] = _fold_review(run_dir, state, draft, scratch)
    return run_dir, skeleton, state


def digest(root, run_dir):
    """`review/input.md` + `review/input.sha256` — steps 1–7 in memory, the temp
    ids discarded. Above 50 K tokens the run proceeds without a review (§2.6)."""
    run_dir, skeleton, state = _prepare(root, run_dir, False)
    entries = _build_entries(root, skeleton, state)
    _cross_unit(root, entries, state)
    text = _digest_text(state, entries)
    path = run_dir / "review" / "input.md"
    tokens = estimate_tokens(text)
    if tokens > DIGEST_CEILING:
        print(f"facts-plan: digest is {tokens} tokens, over the "
              f"{DIGEST_CEILING} ceiling — the run proceeds without a review",
              file=sys.stderr)
        return path
    write_text_atomic(path, text)
    write_text_atomic(run_dir / "review" / "input.sha256",
                      hashlib.sha256(text.encode("utf-8")).hexdigest() + "\n")
    return path


def assemble(root, run_dir, *, review=False):
    """Steps 0–9 once over the merged decision set (§2.6). Deterministic:
    ascending unit id, ascending skeleton id, ids minted in kind order."""
    run_dir, skeleton, state = _prepare(root, run_dir, review)
    entries = _build_entries(root, skeleton, state)
    _cross_unit(root, entries, state)
    _settle(entries, state)
    problems = _lint_entries(root, entries, skeleton.get("unit_symbols") or [],
                             state.get("reviewed") or ())
    if problems:
        for line in problems:
            print(f"facts-plan: {line}", file=sys.stderr)
        raise SystemExit(2)
    clean = [{k: v for k, v in e.items() if not k.startswith("_")}
             for e in entries]
    write_json_atomic(run_dir / "facts-delta.json",
                      {"schema_version": 2, "entries": clean})
    write_json_atomic(run_dir / "assembly.json",
                      {"dropped": state["dropped"], "undecided": state["undecided"],
                       "provenance": state["provenance"],
                       "review_status": state["review_status"]})
    write_text_atomic(run_dir / "gate-b.md", gate_b(root, skeleton, entries, state))
    return {"entries": len(clean), "dropped": len(state["dropped"]),
            "undecided": len(state["undecided"]),
            "review_status": state["review_status"]}


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

    The owner answers «۱ الف» at Gate B and the playbook resolves what that
    number named, so `gate-b.md` and `report.md` have to number the same list
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
    issues = [i for i in skeleton["issues"]]
    reasons = []
    for dropped in state["dropped"]:
        word = REASON_FA.get(dropped["reason_code"])
        if word and word not in reasons:
            reasons.append(word)
    out = [f"خلاصهٔ اعداد {name} — برای تأیید", "",
           f'ثبت می‌شود: {_fa(counts["rule"])} قاعده، {_fa(counts["record"])} '
           f'جدول، {_fa(counts["item"])} قلم، {_fa(counts["measurement"])} '
           f'اندازه‌گیری، {_fa(counts["note"])} یادداشت.',
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

    # §2.1's Stage 2 row: `dump-workbook --manifest` skips a row the owner has
    # not placed, and this is where that workbook is named — by its file title
    # and branch, the way `build._where` names a tab, never by an id or a path.
    manifest = read_json(root / "attachments" / "sheets" / "manifest.json")
    branch_fa = {b["code"]: b["name"] for b in manifest.get("branches") or []}
    skipped = []
    for row in manifest["workbooks"]:
        departments = row.get("departments") or []
        # An unplaced row belongs to no department, so no run would ever name
        # it if this asked for a match alone.
        if not row.get("unresolved") or (departments
                                         and skeleton["department"] not in departments):
            continue
        where = "، ".join(branch_fa.get(b, b) for b in row.get("branches") or [])
        skipped.append(
            f'  • «{pathlib.Path(row.get("file") or "").stem}»'
            + (f" ({where})" if where else "") + ": "
            + " و ".join(UNRESOLVED_FA.get(c, c) for c in row["unresolved"])
            + " مشخص نشده است.")

    disputes = _disputes(entries)
    unknown = [(e, null_paths(e)) for e in entries]
    unknown = [(e, p) for e, p in unknown if p]

    out = [f"گزارش پایان اجرا — {name}", "",
           f'ثبت شد: {_fa(len(entries))} مورد. '
           f'کنار گذاشته شد: {_fa(len(assembly["dropped"]))} مورد. '
           f'{_fa(len(assembly["undecided"]))} مورد بررسی‌نشده.', ""]
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
    if skeleton["issues"]:
        out.append("ایرادهای یافته‌شده در فایل‌ها:")
        grouped = {}
        for issue in skeleton["issues"]:
            grouped.setdefault(issue["kind"], []).append(issue["description"])
        for kind, described in sorted(grouped.items()):
            out.append(f'  {ISSUE_FA.get(kind, "ایراد")} ({_fa(len(described))} مورد):')
            out += [f"    • {d}" for d in described[:5]]
        out.append("")
    if skipped:
        out.append(f"فایل‌هایی که در این اجرا خوانده نشدند ({_fa(len(skipped))}"
                   " مورد) — پس از تعیین تکلیف، در اجرای بعدی خوانده می‌شوند:")
        out += skipped + [""]
    if assembly["undecided"]:
        out.append("یک بخش از داده‌ها ناتمام ماند و در اجرای بعدی تکمیل می‌شود.")
    out.append({"applied": "بازبینی انجام شد.",
                "discarded": "بازبینی انجام نشد و نتیجه بدون آن ثبت شد.",
                "absent": "بازبینی اجرا نشد."}[assembly["review_status"]])
    path = run_dir / "report.md"
    write_text_atomic(path, "\n".join(out) + "\n")
    return path
