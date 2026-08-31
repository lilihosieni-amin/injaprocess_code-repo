"""`merge facts audit` and `merge facts check` — the two reporting verbs (§12).

They read; they never write. No `--run`, nothing under `DATA_ROOT` touched, and
exit 0 whatever they find: a finding is a line for a human to approve at the
playbook's stage C, not a failed precondition. Each verb returns a list of
`{"code", "id", "message", "proposal"}` — `id` is the entry the reader should
open (`None` where the finding is about the manifest rather than an entry) and
`proposal` is filled only where the audit can name the repair, which today is
the `superseded_by` heir of a tombstoned process (QF-8).

One small function per finding code, each a pure walk over the store, the
manifest, `departments/**` and — for `row_gone` — the workbook dump. The list
is sorted by `(code, id, message)` so two runs over one store print the same
lines in the same order.

Two readings the spec leaves open, written down here rather than guessed at
twice:

- **`component_sum`** (§12: "component sums differing from a stated total by
  more than 1 %"). The estate's only component shape is a rule whose outputs
  carry `share` (§7's butchery yield), and the total those shares state is 1.
  `validate` holds a *delta* to 1 ± 0.001; the audit holds the **store** to
  1 ± 1 %, which is what catches a share appended by a later run — legal in
  its own delta, wrong beside the shares already there.
- **`row_gone`** reads `attachments/sheets/.dump/{spreadsheetId}/rows.tsv`
  (Appendix C). A `refItems` cell holds the item's *key* while the dump holds
  what the tab printed, so a store row counts as present when the dump row
  carries its key, its primaryKey values, or — for a `refItems` column — the
  item's `code`, `title` or an alias. `dump-workbook` lands in a later task;
  until it runs, every reference record's workbook reports `dump_missing`,
  which is the honest answer and not a row-by-row alarm.
"""
import datetime
import pathlib
import re
import unicodedata

from engine_common import read_json
from merge_facts import (KIND_ORDER, canonical_scope, collect_leaves, is_open,
                         iter_ref_objects, load_store, sha256_file)
from merge_facts.apply import (FACT_ID_RE, PACK_KEYS, PROC_ID_RE, TEMP_ID_RE,
                               UNITS_KEY, _declared_fields, _declared_rows,
                               _is_stub)

TOLERANCE = 0.01          # 1 % — §12's reconciliation and component-sum bound
STALE_RUNS = 3            # §12: "untouched for three facts runs"
STALE_DAYS = 30           # §12: "or older than 30 days"
NOTE_OVERLAP = 0.7        # token overlap at which two notes are one shape
RUN_STAMP = "%Y%m%d-%H%M%S"
ESTATE_DIR = "attachments/sheets/"
# Role-bearing leaves (§15). `signatures[].role` is read on its own because a
# leaf named `role` is, everywhere else in a payload, a record's
# `log | reference | mirror | report | config`.
ROLE_LEAVES = ("filled_by", "approved_by", "by")
_DIGITS = {ord(c): str(i % 10) for i, c in
           enumerate("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩")}
_LETTERS = {ord("ي"): "ی", ord("ك"): "ک", 0x200C: "", 0x200F: "", 0x200E: ""}


# --------------------------------------------------------------------------- #
# the walk every check shares
# --------------------------------------------------------------------------- #

class _Walk:
    """The store, read once, in the shapes the checks want it in."""

    def __init__(self, root, store):
        self.root = pathlib.Path(root)
        self.store = store
        self.entries = [e for kind in KIND_ORDER for e in store[kind]["entries"]]
        self.open = [e for e in self.entries if is_open(e)]
        self.by_id = {e["id"]: e for e in self.entries}


def _finding(code, fact_id, message, proposal=None):
    return {"code": code, "id": fact_id, "message": message, "proposal": proposal}


def _data(entry):
    return entry.get("data") or {}


def _rows(entry):
    return [r for r in _data(entry).get("rows") or [] if isinstance(r, dict)]


def _records(walk):
    return [e for e in walk.open if e["kind"] == "record"]


def _rules(walk):
    return [e for e in walk.open if e["kind"] == "rule"]


def _norm(text):
    """Persian folded for comparison only — never for storage (§18 keeps the
    store byte-wise). NFKC, Arabic ي/ك to Persian, Persian and Arabic digits to
    ASCII, the zero-width and direction marks dropped."""
    return unicodedata.normalize("NFKC", str(text)).translate(_LETTERS) \
        .translate(_DIGITS).casefold()


def _fold(text):
    """`_norm` with every space gone — «تلورانس روزانه» and «تلورانس‌روزانه»
    fold to one string."""
    return "".join(_norm(text).split())


def _shape(text):
    """`_fold` with digit runs collapsed — two notes differing only in the
    number they carry have one shape."""
    return re.sub(r"[0-9]+", "#", _fold(text))


def _tokens(text):
    return {t for t in re.split(r"[^0-9a-z؀-ۿ#]+",
                               re.sub(r"[0-9]+", "#", _norm(text))) if t}


def _number(value):
    return value if isinstance(value, (int, float)) \
        and not isinstance(value, bool) else None


def _beyond(value, reference):
    """A disagreement past 1 % of the reference (any difference at all when the
    reference is 0)."""
    if reference == 0:
        return value != 0
    return abs(value - reference) > TOLERANCE * abs(reference)


# --------------------------------------------------------------------------- #
# audit — §12's list, in its order
# --------------------------------------------------------------------------- #

def _duplicate_output(walk):
    """Two rules whose outputs write one `{ref, field}` — the ERP would not
    know which one filled the cell."""
    writers = {}
    for rule in _rules(walk):
        for out in _data(rule).get("outputs") or []:
            target = out.get("writes_to") if isinstance(out, dict) else None
            if isinstance(target, dict) and target.get("ref"):
                writers.setdefault((target["ref"], target.get("field")),
                                   []).append(rule["id"])
    items = []
    for (ref, field), ids in writers.items():
        if len(ids) < 2:
            continue
        where = f"{ref}/{field}" if field else ref
        writing = sorted(set(ids))
        who = ", ".join(writing) if len(writing) > 1 else f"{writing[0]} twice"
        items.append(_finding("duplicate_output", writing[0],
                              f"{where} is written by {who}"))
    return items


def _lookalike_title(walk):
    """The backstop for the byte-wise comparison §18 keeps: titles (and keys)
    that differ only in spacing, digits, case or ی/ي."""
    items = []
    for attr, fold in (("title", _fold),
                       ("key", lambda v: _fold(str(v).replace("_", "")))):
        groups = {}
        for entry in walk.open:
            groups.setdefault((entry["kind"], fold(entry.get(attr) or "")),
                              []).append(entry)
        for (kind, _folded), members in groups.items():
            if len(members) < 2 or len({m.get(attr) for m in members}) < 2:
                continue
            members = sorted(members, key=lambda m: m["id"])
            spelled = ", ".join(f"{m['id']} {m.get(attr)!r}" for m in members)
            items.append(_finding("lookalike_title", members[0]["id"],
                                  f"{kind} {attr}s look alike: {spelled}"))
    return items


def _orphan_ref(walk):
    """QF-37: every `{ref}` resolves and every `field`/`row` it names is
    declared. An edge into a stub is deferred, so it is checked here only once
    the stub has been filled — which is what makes a stub fill re-open it."""
    items = []
    for entry in walk.open:
        for obj in iter_ref_objects(entry):
            ref = obj.get("ref")
            if not isinstance(ref, str) or PROC_ID_RE.fullmatch(ref):
                continue                      # a process link — `_process_link`
            if TEMP_ID_RE.fullmatch(ref):
                items.append(_finding("orphan_ref", entry["id"],
                                      f"temp id {ref} was never rewritten"))
                continue
            if not FACT_ID_RE.fullmatch(ref):
                items.append(_finding("orphan_ref", entry["id"],
                                      f"reference {ref!r} matches no id grammar"))
                continue
            target = walk.by_id.get(ref)
            if target is None:
                items.append(_finding("orphan_ref", entry["id"],
                                      f"{ref} names no entry in the store"))
                continue
            if _is_stub(target):
                continue
            field, row = obj.get("field"), obj.get("row")
            if field and field not in _declared_fields(target):
                items.append(_finding("orphan_ref", entry["id"],
                                      f"{ref} declares no field {field!r}"))
            if row and row not in _declared_rows(target):
                items.append(_finding("orphan_ref", entry["id"],
                                      f"{ref} declares no row {row!r}"))
    return items


def _dangling_ref_items(walk):
    """A `refItems` cell holds an item **key** (QF-37's one exception); the item
    it names must still be open."""
    open_keys = {e["key"] for e in walk.store["item"]["entries"] if is_open(e)}
    known_keys = {e["key"] for e in walk.store["item"]["entries"]}
    items = []
    for record in _records(walk):
        columns = [f["key"] for f in _data(record).get("fields") or []
                   if isinstance(f, dict) and f.get("refItems") and f.get("key")]
        for row in _rows(record):
            if not is_open(row):
                continue
            for column in columns:
                cell = row.get(column)
                if not isinstance(cell, str) or not cell or cell in open_keys:
                    continue
                why = "is retired" if cell in known_keys else "names no item"
                items.append(_finding(
                    "dangling_ref_items", record["id"],
                    f"row {row.get('key')!r} column {column!r}: item {cell!r} {why}"))
    return items


def _process_doc(root, process_id):
    path = (root / "departments" / process_id.rsplit("-", 1)[0] / "processes"
            / f"{process_id}.json")
    try:
        return read_json(path)
    except (OSError, ValueError):
        return None


def _heir(doc):
    """A process doc's `superseded_by` is a list (`restructure` writes several
    heirs); a hand-written one may carry the bare id."""
    heirs = doc.get("superseded_by")
    if isinstance(heirs, str):
        return heirs
    if isinstance(heirs, list) and heirs:
        return str(heirs[0])
    return None


def _cited_nodes(entry):
    """`{process id: {node ids}}` from the entry's `process` sources (QF-8 —
    a link is a claim, and its evidence is the node it cites)."""
    out = {}
    for source in entry.get("source") or []:
        if source.get("type") != "process" or not source.get("node"):
            continue
        ref = source.get("ref") or ""
        process_id = pathlib.PurePosixPath(ref).stem
        if PROC_ID_RE.fullmatch(process_id):
            out.setdefault(process_id, set()).add(source["node"])
    return out


def _process_link(walk):
    """QF-8's third moment: the link whose process is tombstoned (the heir
    proposed as an approvable re-point) or whose cited node is gone."""
    items = []
    for entry in walk.open:
        cited = _cited_nodes(entry)
        linked = [p["ref"] for p in entry.get("processes") or []
                  if isinstance(p, dict) and isinstance(p.get("ref"), str)]
        for process_id in sorted(set(linked) | set(cited)):
            doc = _process_doc(walk.root, process_id)
            if doc is None:
                items.append(_finding("process_link", entry["id"],
                                      f"process {process_id} has no file"))
                continue
            if doc.get("tombstoned"):
                heir = _heir(doc)
                tail = f" — heir {heir} proposed" if heir else " and has no heir"
                items.append(_finding("process_link", entry["id"],
                                      f"process {process_id} is tombstoned{tail}",
                                      heir))
                continue
            live = {n.get("id") for n in doc.get("nodes") or []
                    if isinstance(n, dict) and not n.get("removed")}
            for node in sorted(cited.get(process_id, ())):
                if node not in live:
                    items.append(_finding(
                        "process_link", entry["id"],
                        f"node {node} is no longer in process {process_id}"))
    return items


def _dump_rows(root, spreadsheet_id, sheet):
    """The latest dump's `rows.tsv` for one workbook, as dicts keyed by its
    header, narrowed to one tab when the dump names the tab (Appendix C).
    `None` when the workbook has no dump at all."""
    path = (root / "attachments" / "sheets" / ".dump" / spreadsheet_id
            / "rows.tsv")
    if not path.is_file():
        return None
    lines = [line for line in path.read_text(encoding="utf-8").splitlines()
             if line.strip()]
    if not lines:
        return []
    header = lines[0].split("\t")
    rows = [dict(zip(header, line.split("\t"))) for line in lines[1:]]
    if sheet and "sheet" in header:
        rows = [r for r in rows if r.get("sheet") == sheet]
    return rows


def _item_labels(walk):
    """Item key → every string the estate may have printed for it, so a
    `refItems` cell can be matched against a dump that holds codes or titles."""
    out = {}
    for item in walk.store["item"]["entries"]:
        labels = {item["key"], item.get("title") or ""}
        labels |= set(item.get("aliases") or [])
        code = _data(item).get("code")
        if code:
            labels.add(str(code))
        out[item["key"]] = {_fold(v) for v in labels if v}
    return out


def _row_present(record, row, dump_rows, labels):
    """Is this store row still in the dump? Its key, its primaryKey values or —
    for a `refItems` column — the item's printed code or title."""
    data = _data(record)
    primary = [k for k in data.get("primaryKey") or [] if isinstance(k, str)]
    key = row.get("key")
    for dump_row in dump_rows:
        cells = {_fold(v) for v in dump_row.values() if v}
        if key and _fold(key) in cells:
            return True
        if not primary:
            continue
        matched = True
        for column in primary:
            value = row.get(column)
            if value is None:
                matched = False
                break
            wanted = {_fold(value)} | labels.get(value, set())
            cell = dump_row.get(column)
            found = {_fold(cell)} & wanted if cell else wanted & cells
            if not found:
                matched = False
                break
        if matched:
            return True
    return False


def _row_gone(walk):
    """§9: a re-dump that no longer carries a row the store holds. With no dump
    for the workbook there is nothing to compare, and the audit says so once
    per workbook rather than once per row."""
    items, missing = [], {}
    labels = _item_labels(walk)
    for record in _records(walk):
        data = _data(record)
        spreadsheet = (data.get("location") or {}).get("spreadsheetId")
        rows = [r for r in _rows(record) if is_open(r)]
        if not spreadsheet or not rows or _is_stub(record):
            continue
        dump_rows = _dump_rows(walk.root, spreadsheet,
                               (data.get("location") or {}).get("sheet"))
        if dump_rows is None:
            missing.setdefault(spreadsheet, []).append(record["id"])
            continue
        for row in rows:
            if not _row_present(record, row, dump_rows, labels):
                items.append(_finding(
                    "row_gone", record["id"],
                    f"row {row.get('key')!r} is in no row of the latest dump of "
                    f"{spreadsheet}"))
    for spreadsheet, ids in missing.items():
        items.append(_finding(
            "dump_missing", sorted(ids)[0],
            f"no attachments/sheets/.dump/{spreadsheet}/rows.tsv — the rows of "
            f"{', '.join(sorted(ids))} cannot be checked"))
    return items


def _retired_row_live_edges(walk):
    """§9: a row is retired, never removed — and an edge still reading it is
    reading a definition that has been withdrawn."""
    retired = {}
    for record in _records(walk):
        for row in _rows(record):
            if row.get("key") and not is_open(row):
                retired[(record["id"], row["key"])] = row
    items = []
    for entry in walk.open:
        for obj in iter_ref_objects(entry):
            edge = (obj.get("ref"), obj.get("row"))
            row = retired.get(edge) if obj.get("row") else None
            if row is None:
                continue
            items.append(_finding(
                "retired_row_live_edges", entry["id"],
                f"{entry['id']} still reads row {edge[1]!r} of {edge[0]}, "
                f"retired {row.get('valid_to') or ''}".rstrip()))
    return items


def _template_drift(walk):
    """QF-4: a branch instance whose `expr` no longer matches the template it
    was copied from — a copy and a drift must stay distinguishable."""
    items = []
    for rule in _rules(walk):
        data = _data(rule)
        template = data.get("template_of")
        if not isinstance(template, dict) or not template.get("ref"):
            continue
        target = walk.by_id.get(template["ref"])
        if target is None:                    # `_orphan_ref` reports the dangle
            continue
        mine, theirs = data.get("expr"), _data(target).get("expr")
        if mine == theirs:
            continue
        declared = data.get("divergence")
        items.append(_finding(
            "template_drift", rule["id"],
            f"expr {mine!r} differs from {target['id']}'s {theirs!r}"
            + (f" (divergence: {declared})" if declared else "")))
    return items


def _output_value(rule, field):
    outputs = [o for o in _data(rule).get("outputs") or [] if isinstance(o, dict)]
    if field:
        outputs = [o for o in outputs if o.get("key") == field]
    elif len(outputs) != 1:                   # `{ref}` means "the one output"
        return None, None
    return (outputs[0].get("key"), outputs[0].get("value")) if outputs \
        else (None, None)


def _reconciliation(walk):
    """§9's `reconciled_against`: a table cell and the report formula's constant
    must agree within 1 %, or the report is multiplying by something the BOM
    does not say."""
    items = []
    for record in _records(walk):
        rows = {r.get("key"): r for r in _rows(record)}
        for pair in _data(record).get("reconciled_against") or []:
            if not isinstance(pair, dict):
                continue
            cell, against = pair.get("cell") or {}, pair.get("against") or {}
            row = rows.get(cell.get("row"))
            rule = walk.by_id.get(against.get("ref"))
            if row is None or rule is None:
                continue                      # `_orphan_ref` owns the dangles
            key, stated = _output_value(rule, against.get("field"))
            held = _number(row.get(cell.get("field")))
            stated = _number(stated)
            if held is None or stated is None or not _beyond(held, stated):
                continue
            items.append(_finding(
                "reconciliation", record["id"],
                f"cell {cell.get('field')}/{cell.get('row')} is {held}, "
                f"{rule['id']}'s {key} is {stated} — beyond 1 %"))
    return items


def _component_sum(walk):
    """§7's shares: the components of one input, whose stated total is 1."""
    items = []
    for rule in _rules(walk):
        shares = [(o.get("key"), _number(o.get("share")))
                  for o in _data(rule).get("outputs") or []
                  if isinstance(o, dict) and _number(o.get("share")) is not None]
        if len(shares) < 2:
            continue
        total = sum(share for _key, share in shares)
        if _beyond(total, 1):
            spelled = ", ".join(f"{key}={share}" for key, share in shares)
            items.append(_finding(
                "component_sum", rule["id"],
                f"shares sum to {round(total, 6)}, not 1: {spelled}"))
    return items


def _consumer_refs(entry):
    """The edges §12 counts as consumption — "no rule consumes and no record
    field derives": a rule's `inputs[].from`, the `via` conversion on an edge,
    its `calls[]`, and a record column's `derived`. A `reconciled_against`
    pair, a `mirror_of` or a `template_of` names a constant without reading
    it, and deliberately does not count."""
    data = _data(entry)
    refs = set()
    for member in (data.get("inputs") or []) + (data.get("outputs") or []):
        if not isinstance(member, dict):
            continue
        for slot in ("from", "via"):
            edge = member.get(slot)
            if isinstance(edge, dict) and isinstance(edge.get("ref"), str):
                refs.add(edge["ref"])
    for call in data.get("calls") or []:
        if isinstance(call, dict) and isinstance(call.get("ref"), str):
            refs.add(call["ref"])
    for field in data.get("fields") or []:
        derived = field.get("derived") if isinstance(field, dict) else None
        if isinstance(derived, dict) and isinstance(derived.get("ref"), str):
            refs.add(derived["ref"])
    return refs


def _unconsumed_constant(walk):
    """§7: a constant is a rule with no inputs. One nothing reads is either a
    setting the ERP still needs a consumer for, or a mis-read literal."""
    consumers = {}
    for entry in walk.open:
        for ref in _consumer_refs(entry):
            consumers.setdefault(ref, set()).add(entry["id"])
    items = []
    for rule in _rules(walk):
        data = _data(rule)
        if data.get("inputs"):
            continue
        if consumers.get(rule["id"], set()) - {rule["id"]}:
            continue
        items.append(_finding(
            "unconsumed_constant", rule["id"],
            f"constant {rule['key']} is read by no rule and derives no "
            "record field"))
    return items


def _recurring_note_shape(walk):
    """QF-13: the audit owns promotion. Notes that say the same kind of thing
    are a shape the taxonomy is missing — grouped by their folded statement
    (digits collapsed) or by a token overlap past `NOTE_OVERLAP`."""
    notes = sorted((e for e in walk.open if e["kind"] == "note"),
                   key=lambda e: e["id"])
    groups = []
    for note in notes:
        shape, tokens = _shape(note.get("statement") or ""), \
            _tokens(note.get("statement") or "")
        for group in groups:
            if shape == group["shape"] or _overlap(tokens, group["tokens"]) \
                    >= NOTE_OVERLAP:
                group["members"].append(note)
                break
        else:
            groups.append({"shape": shape, "tokens": tokens, "members": [note]})
    items = []
    for group in groups:
        if len(group["members"]) < 2:
            continue
        ids = [m["id"] for m in group["members"]]
        items.append(_finding(
            "recurring_note_shape", ids[0],
            f"{', '.join(ids)} repeat one shape: "
            f"{group['members'][0].get('statement')!r}"))
    return items


def _overlap(left, right):
    union = left | right
    return len(left & right) / len(union) if union else 0.0


def _run_stamps(root, department):
    out = []
    directory = root / "runs" / "facts" / (department or "")
    if not department or not directory.is_dir():
        return out
    for child in directory.iterdir():
        try:
            out.append(datetime.datetime.strptime(child.name, RUN_STAMP)
                       .replace(tzinfo=datetime.timezone.utc))
        except ValueError:
            continue                          # not a run directory
    return out


def _creating_run(entry):
    """`(department, stamp)` of the run that first cited this entry — QF-7's
    run directory, `runs/facts/{dept}/{stamp}`. The department falls back to
    the entry's own scope; the stamp to `None`."""
    for source in entry.get("source") or []:
        parts = pathlib.PurePosixPath(source.get("run") or "").parts
        if len(parts) >= 3 and parts[0] == "runs" and parts[1] == "facts":
            stamp = parts[3] if len(parts) >= 4 else None
            try:
                stamp = datetime.datetime.strptime(stamp, RUN_STAMP) \
                    .replace(tzinfo=datetime.timezone.utc) if stamp else None
            except ValueError:
                stamp = None
            return parts[2], stamp
    departments = (entry.get("scope") or {}).get("departments") or []
    return (departments[0] if departments else None), None


def _parse_iso(stamp):
    try:
        return datetime.datetime.strptime(str(stamp), "%Y-%m-%dT%H:%M:%SZ") \
            .replace(tzinfo=datetime.timezone.utc)
    except ValueError:
        return None


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def _stale_stub(walk):
    """QF-20's stubs are identity and nothing else. One still empty three runs
    later — or a month later — is a workbook nobody came back for."""
    items = []
    for entry in walk.open:
        if not _is_stub(entry):
            continue
        touched = _parse_iso(entry.get("updated_at"))
        if touched is None:
            continue
        department, created = _creating_run(entry)
        # "Since" is the later of the last touch and the run that wrote the
        # stub — the writing run is never one of the runs it was untouched
        # through, whatever the clock skew between a stamp and `updated_at`.
        since = max([t for t in (touched, created) if t is not None])
        later = [s for s in _run_stamps(walk.root, department) if s > since]
        age = (_now() - touched).days
        if len(later) >= STALE_RUNS:
            items.append(_finding(
                "stale_stub", entry["id"],
                f"stub {entry['key']} is unfilled through {len(later)} facts "
                f"runs in {department}"))
        elif age > STALE_DAYS:
            items.append(_finding(
                "stale_stub", entry["id"],
                f"stub {entry['key']} has been unfilled for {age} days, past "
                f"the {STALE_DAYS}-day mark"))
    return items


def _natural_key(entry):
    scope = canonical_scope(entry.get("scope"))
    return (entry["kind"], entry.get("key"), tuple(scope["departments"]),
            tuple(scope["branches"]))


def _natural_key_dup(walk):
    """QF-15: two open entries on one `(kind, key, scope)`. `apply` refuses to
    create it, so a finding here means the store was written another way."""
    groups = {}
    for entry in walk.open:
        groups.setdefault(_natural_key(entry), []).append(entry["id"])
    items = []
    for (kind, key, _departments, _branches), ids in groups.items():
        if len(ids) > 1:
            items.append(_finding(
                "natural_key_dup", sorted(ids)[0],
                f"{kind} {key} is open twice: {', '.join(sorted(ids))}"))
    return items


def _scope_shadow(walk):
    """QF-43: a departmental entry whose key already exists at empty scope —
    the universal fact and its shadow would disagree silently."""
    universal = {}
    for entry in walk.open:
        scope = canonical_scope(entry.get("scope"))
        if not scope["departments"] and not scope["branches"]:
            universal.setdefault((entry["kind"], entry.get("key")), entry["id"])
    items = []
    for entry in walk.open:
        scope = canonical_scope(entry.get("scope"))
        if not scope["departments"] and not scope["branches"]:
            continue
        twin = universal.get((entry["kind"], entry.get("key")))
        if twin is None:
            continue
        items.append(_finding(
            "scope_shadow", entry["id"],
            f"key {entry.get('key')!r} also exists at empty scope as {twin}"))
    return items


def _unit_rows(walk):
    """Every string the `units` record covers — its row keys, symbols and
    Persian titles (§10)."""
    covered = set()
    for record in walk.store["record"]["entries"]:
        if record.get("key") != UNITS_KEY or not is_open(record):
            continue
        for row in _rows(record):
            if not is_open(row):
                continue
            for name in ("key", "symbol", "unit_title"):
                if isinstance(row.get(name), str):
                    covered.add(_fold(row[name]))
    return covered


def _unit_raw_uncovered(walk):
    """§10: every place the estate wrote a unit keeps the verbatim string, and
    a string no `units` row covers is a symbol the registry still needs."""
    covered = _unit_rows(walk)
    items = []
    for entry in walk.open:
        seen = set()
        for raw in collect_leaves(_data(entry), "unit_raw", PACK_KEYS):
            folded = _fold(raw)
            if not folded or folded in covered or folded in seen:
                continue
            seen.add(folded)
            items.append(_finding(
                "unit_raw_uncovered", entry["id"],
                f"unit_raw {raw!r} is covered by no row of the units record"))
    return items


def _process_roles(root):
    """The vocabulary the process side already holds: every `actor` and every
    `mechanisms` member of every process file (§15)."""
    roles = set()
    departments = root / "departments"
    if not departments.is_dir():
        return roles
    for path in sorted(departments.glob("*/processes/*.json")):
        try:
            doc = read_json(path)
        except (OSError, ValueError):
            continue
        for holder in [doc.get("idef0") or {}] + [n for n in doc.get("nodes") or []
                                                  if isinstance(n, dict)]:
            if isinstance(holder.get("actor"), str):
                roles.add(_fold(holder["actor"]))
            for group in (holder.get("mechanisms"),
                          (holder.get("icom") or {}).get("mechanisms")):
                for role in group or []:
                    if isinstance(role, str):
                        roles.add(_fold(role))
    return roles


def _entry_roles(entry):
    roles = []
    for leaf in ROLE_LEAVES:
        roles += collect_leaves(_data(entry), leaf)
    for signature in _data(entry).get("signatures") or []:
        if isinstance(signature, dict) and isinstance(signature.get("role"), str):
            roles.append(signature["role"])
    for account in entry.get("accounts") or []:
        if isinstance(account.get("speaker_role"), str):
            roles.append(account["speaker_role"])
    return roles


def _unknown_role(walk):
    """§15: roles, never names — and a role the process side has never heard of
    is either a name slipping in or a process file that has not caught up."""
    known = _process_roles(walk.root)
    items = []
    for entry in walk.open:
        seen = set()
        for role in _entry_roles(entry):
            folded = _fold(role)
            if not folded or folded in known or folded in seen:
                continue
            seen.add(folded)
            items.append(_finding(
                "unknown_role", entry["id"],
                f"role {role!r} appears in no process's actor or mechanisms"))
    return items


AUDIT_CHECKS = (_duplicate_output, _lookalike_title, _orphan_ref,
                _dangling_ref_items, _process_link, _row_gone,
                _retired_row_live_edges, _template_drift, _reconciliation,
                _component_sum, _unconsumed_constant, _recurring_note_shape,
                _stale_stub, _natural_key_dup, _scope_shadow,
                _unit_raw_uncovered, _unknown_role)


def _sorted(items):
    return sorted(items, key=lambda i: (i["code"], i["id"] or "", i["message"]))


def audit(root):
    """§12's `audit` row, every check of it, over one read of the store."""
    walk = _Walk(pathlib.Path(root), load_store(root))
    items = []
    for check_fn in AUDIT_CHECKS:
        items.extend(check_fn(walk))
    return _sorted(items)


# --------------------------------------------------------------------------- #
# check — the sources on disk, and the manifest's coverage
# --------------------------------------------------------------------------- #

def _is_estate(ref):
    return ref.startswith(ESTATE_DIR) and ref.endswith(".xlsx")


def _manifest(root):
    try:
        doc = read_json(root / "attachments" / "sheets" / "manifest.json")
    except (OSError, ValueError):
        return {"workbooks": []}
    return doc if isinstance(doc, dict) else {"workbooks": []}


def _cited_workbooks(store):
    """The spreadsheet ids a **non-stub** record names — the coverage
    numerator, and what makes a workbook "read". A retired record counts: the
    reading happened, and the tab it described going away does not un-read the
    workbook. A stub does not: it is identity and nothing else (QF-20)."""
    cited = set()
    for record in store["record"]["entries"]:
        data = record.get("data") or {}
        spreadsheet = (data.get("location") or {}).get("spreadsheetId")
        if spreadsheet and not data.get("stub"):
            cited.add(spreadsheet)
    return cited


def coverage(root):
    """`{"read": n, "total": m}` — manifest workbooks cited by a non-stub
    record, over every manifest workbook. QF-44's readiness test reads it."""
    root = pathlib.Path(root)
    cited = _cited_workbooks(load_store(root))
    workbooks = [w for w in _manifest(root).get("workbooks") or []
                 if isinstance(w, dict)]
    read = [w for w in workbooks if w.get("spreadsheetId") in cited]
    return {"read": len(read), "total": len(workbooks)}


def check(root):
    """§12's `check` row: re-hash every cited file, report the sources that
    moved and the estate files that are not here, and the manifest workbooks
    no record has read."""
    root = pathlib.Path(root)
    store = load_store(root)
    walk = _Walk(root, store)
    items, absent = [], {}
    for entry in walk.open:
        for source in entry.get("source") or []:
            ref = source.get("ref")
            if not isinstance(ref, str) or not ref:
                continue                      # a `chat` source cites no file
            path = root / ref
            if not path.is_file():
                if _is_estate(ref):
                    absent.setdefault(ref, set()).add(entry["id"])
                else:
                    items.append(_finding("source_moved", entry["id"],
                                          f"{ref} is no longer on disk"))
                continue
            held = source.get("hash")
            if held and sha256_file(path) != held:
                items.append(_finding(
                    "source_moved", entry["id"],
                    f"{ref} has changed since it was cited "
                    f"({held[:19]}… on record)"))
    for ref, ids in absent.items():
        items.append(_finding(
            "estate_absent", sorted(ids)[0],
            f"{ref} is not present (QF-28 keeps the workbooks out of git); "
            f"cited by {', '.join(sorted(ids))}"))
    cited = _cited_workbooks(store)
    for workbook in _manifest(root).get("workbooks") or []:
        if not isinstance(workbook, dict):
            continue
        spreadsheet = workbook.get("spreadsheetId")
        if not spreadsheet or spreadsheet in cited:
            continue
        items.append(_finding(
            "uncited_workbook", None,
            f"workbook {workbook.get('short') or spreadsheet} "
            f"({spreadsheet}) is cited by no non-stub record"))
    return _sorted(items)
