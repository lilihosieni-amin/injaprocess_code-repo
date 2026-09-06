"""`facts-plan digest | assemble | report` (§2.6, §2.7), and the `facts-unit`
content pass.

A unit's output is checked the moment it returns (QF-51), by the same rules
`assemble` will later rely on — a document that passes here is one `assemble`
can fold in without asking the model anything twice.

The verbs land here as the tasks that implement them do; `cli.py` reports a
verb whose function is not here yet rather than failing to import.
"""
import pathlib
import re

from engine_common import read_json, validate
from merge_facts.content import lint_prose

from facts_plan.build import process_index

#: A template field the record unit has not renamed yet — §2.5's `c_h`. The
#: `c_` prefix is what marks a ref provisional, so a field wearing it in any
#: case is held to the grammar; anything else is a minted key.
PROVISIONAL_FIELD = re.compile(r"^c_[a-z]{1,3}$")
REVIEW_DECISIONS, REVIEW_REWRITES = 60, 20
PROSE_IN_DATA = ("grain", "method", "exceptions")


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
    known = {c["id"] for c in skeleton["candidates"]}
    symbols = skeleton.get("unit_symbols") or []
    nodes = process_index(root, skeleton["department"])
    node_ids = {f'{n["process"]}::{n["node"]}' for n in nodes} \
        | {f'{n["process"]}::{n["node"].rsplit("-", 1)[-1]}' for n in nodes}
    problems, seen, unit = list(caps), [], None
    if doc["unit"] != "review":
        # A document belongs to the unit whose directory it sits in, never to
        # the one it names: a document declaring a zero-candidate sibling would
        # otherwise decide nothing and still be `done`.
        in_units = path.parent.parent.name == "units"
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
        for field in _members(decision.get("data") or {}, "fields"):
            if field.get("unit") and field.get("type") not in (None, "number"):
                problems.append(f'{label}: field {field.get("key")} is '
                                f'{field.get("type")} and carries a unit')
        problems += _lint_decision(decision, label, symbols)

    for n, entry in enumerate(doc.get("new") or []):
        label = f'new[{n}] {entry.get("key")}'
        problems += _citations(entry, label, node_ids, skeleton["department"]) \
            + _lint_decision(entry, label, symbols)

    if unit is not None:
        for cid in unit["candidates"]:
            if cid not in seen:
                problems.append(f'{unit["id"]}: {cid} has no decision')
    return problems


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


def _lint_decision(decision, label, symbols):
    """§5.2 at unit level (QF-50) — the unit that wrote a failing sentence is
    the one that fixes it, which is only true while the decision is still
    addressable by its own index."""
    out = []
    parts = decision.get("into") if decision.get("action") == "split" else [decision]
    for part in parts or []:
        for key in ("title", "statement"):
            for message in lint_prose(part.get(key) or "", exemptions=symbols):
                out.append(f"{label}: {key}: {message}")
        for alias in part.get("aliases") or []:
            for message in lint_prose(alias, exemptions=symbols):
                out.append(f"{label}: aliases: {message}")
        data = part.get("data") or {}
        for key in PROSE_IN_DATA:
            for message in lint_prose(data.get(key) or "", exemptions=symbols):
                out.append(f"{label}: {key}: {message}")
        for field in _members(data, "fields"):
            for message in lint_prose(field.get("description") or "",
                                      exemptions=symbols, allow_sheet_words=True):
                out.append(f'{label}: fields/{field.get("key")}: {message}')
        for tracked in _members(data, "tracked"):
            for message in lint_prose(tracked.get("reason") or "",
                                      exemptions=symbols):
                out.append(f"{label}: tracked: {message}")
        for issue in _members(data, "issues"):
            if not issue.get("engine"):
                for message in lint_prose(issue.get("description") or "",
                                          exemptions=symbols):
                    out.append(f"{label}: issues: {message}")
    return out
