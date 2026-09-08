"""`merge facts audit` and `merge facts check` — the two reporting verbs (§12).

They read; they never write. No `--run`, nothing under `DATA_ROOT` touched, and
exit 0 whatever they find: a finding is a line for a human to approve at the
playbook's stage C, not a failed precondition. `audit` returns a list of
`{"code", "id", "message", "proposal"}` and `check` returns that list under
`findings` beside QF-44 (v3)'s readiness answers — `id` is the entry the reader
should open (`None` where the finding is about the manifest rather than an entry) and
`proposal` is filled where the audit can name the repair — the `superseded_by`
heir of a tombstoned process (QF-8) — or the bare word `info`, which says the
line is information rather than a defect (§4's `unconsumed_constant`).

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
                         iter_ref_objects, load_store, open_accounts,
                         sha256_file)
from merge_facts.apply import (FACT_ID_RE, PROC_ID_RE, TEMP_ID_RE,
                               _declared_fields, _declared_rows, _is_stub)
from merge_facts.content import lint_prose
# `_unit_row_keys` is `preconditions`' own (Task 5 moved it there; `apply`
# re-exports the neighbours above but not this one), and it answers the same
# question `_lint_failures` has to ask: which Latin symbols the units record
# licenses.
from merge_facts.preconditions import _unit_row_keys

TOLERANCE = 0.01          # 1 % — §12's reconciliation and component-sum bound
STALE_RUNS = 3            # §12: "untouched for three facts runs"
STALE_DAYS = 30           # §12: "or older than 30 days"
NOTE_OVERLAP = 0.35       # §4: a third of the tokens is one shape
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

_A1_RANGE = re.compile(r"([A-Z]{1,3})(\d+)(?::[A-Z]{1,3}(\d+))?\s*$")


def _bindings(rule):
    """Every (instance, column, first row, last row, key) a rule runs on, read
    off `applies_to[]` — whose key is `<instance>__<column>__r<first row>`
    (§3.1) and whose `range` carries the span.

    ponytail: the span is an A1 regex over the end of the range; a whole-column
    or whole-sheet range answers one row, the one its key names. Widen it if
    the estate ever grows a column-wide formula.
    """
    out = []
    for member in _data(rule).get("applies_to") or []:
        if not isinstance(member, dict) or not isinstance(member.get("key"), str):
            continue
        parts = member["key"].rsplit("__", 2)
        if len(parts) != 3:
            continue
        instance, column, row = parts
        found = _A1_RANGE.search(str(member.get("range") or ""))
        first = int(found.group(2)) if found else int(row.lstrip("r") or 0)
        last = int(found.group(3)) if found and found.group(3) else first
        out.append((instance, column, first, last, member["key"]))
    return out


def _duplicate_output(walk):
    """§2.6 step 7's `two_writers`: two rules whose `applies_to` bindings
    overlap on one instance, one column and meeting row ranges — the ERP would
    not know which one computed the cell.

    Keyed on the binding, not on `(ref, field)` (§4): one column of one tab is
    written by one rule per band, and two rules over one band is the
    contradiction. The old `writes_to` grouping said nothing about which rows,
    so a report column computed by two rules over two disjoint bands — the
    estate as it is — read as a defect.

    ponytail: O(n²) over the bindings of one department's rules; a store-wide
    index by (instance, column) is the upgrade if the estate outgrows it.
    """
    items = []
    bound = [(rule["id"], b) for rule in _rules(walk) for b in _bindings(rule)]
    for index, (left_id, left) in enumerate(bound):
        for right_id, right in bound[index + 1:]:
            if left_id == right_id or left[:2] != right[:2]:
                continue
            if left[3] < right[2] or right[3] < left[2]:
                continue                       # the bands do not meet
            items.append(_finding(
                "two_writers", min(left_id, right_id),
                f"{left_id} ({left[4]}) and {right_id} ({right[4]}) both write "
                f"column {left[1].upper()} of {left[0]}"))
    return items


def _lookalike_title(walk):
    """The backstop for the byte-wise comparison §18 keeps: titles (and keys)
    that differ only in spacing, digits, case or ی/ي.

    The title folds digit RUNS as well (§4) — «تلورانس ۵ گرم» and «تلورانس ۷
    گرم» are one concept with a parameter, not two rules. The key does not: a
    note's key is `note_` plus twelve hex, and collapsing its digits would make
    two unrelated notes look alike.
    """
    items = []
    for attr, fold in (("title", _shape),
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
            items.append(_finding("duplicate_title", members[0]["id"],
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


DUMP_BOOKKEEPING = ("sheet", "row")


def _dump_rows(root, spreadsheet_id, sheet):
    """The latest dump's `rows.tsv` for one workbook, as dicts keyed by its
    header, narrowed to one tab when the dump names the tab (Appendix C).
    `None` when the workbook has no dump at all.

    `dump-workbook` writes one file per workbook — `sheet`, `row`, then one
    column per header cell of every dumped reference tab. The first two are
    bookkeeping and are dropped once they have done their narrowing: they are
    not cells, and a store row keyed `2` or `پیتزا` must not be counted present
    because a row index or a tab name happens to say so. (The dumper never mints
    a reference column called `sheet` or `row`, so nothing else is lost.)
    """
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
    return [{k: v for k, v in row.items() if k not in DUMP_BOOKKEEPING}
            for row in rows]


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


def _record_locations(record):
    """Every (spreadsheetId, sheet, instance key) a record's rows may be dumped
    under — its `instances[]` (QF-47), or its `location` for a record that has
    none."""
    data = _data(record)
    out = [(i.get("spreadsheetId"), i.get("sheet"), i.get("key"))
           for i in data.get("instances") or []
           if isinstance(i, dict) and i.get("spreadsheetId")]
    if out:
        return out
    location = data.get("location") or {}
    if location.get("spreadsheetId"):
        return [(location["spreadsheetId"], location.get("sheet"), None)]
    return []


def _row_gone(walk):
    """§9 over §4's instances: a re-dump that no longer carries a row the store
    holds. A template repeats across its instances, so a row present in ANY
    instance's dump is present; `dump_missing` is reported per (entry,
    instance) whose workbook has no `rows.tsv` at all, because that instance —
    not the record — is what nobody has dumped."""
    items = []
    labels = _item_labels(walk)
    for record in _records(walk):
        rows = [r for r in _rows(record) if is_open(r)]
        places = _record_locations(record)
        if not rows or not places or _is_stub(record):
            continue
        dumps = []
        for spreadsheet, sheet, key in places:
            dump_rows = _dump_rows(walk.root, spreadsheet, sheet)
            if dump_rows is None:
                items.append(_finding(
                    "dump_missing", record["id"],
                    f"no attachments/sheets/.dump/{spreadsheet}/rows.tsv — the "
                    f"rows of {record['id']}"
                    + (f" instance {key}" if key else "")
                    + " cannot be checked"))
            else:
                dumps.extend(dump_rows)
        if not dumps:
            continue                       # nothing at all to compare against
        for row in rows:
            if not _row_present(record, row, dumps, labels):
                items.append(_finding(
                    "row_gone", record["id"],
                    f"row {row.get('key')!r} is in no row of the latest dump of "
                    f"{', '.join(sorted({p[0] for p in places}))}"))
    return items


def _formula_ranges(root, spreadsheet_id):
    """The (sheet, range) pairs the latest dump holds for one workbook —
    `formulas.tsv`, one row per (sheet, range) (§4). `None` when the workbook
    has no dump at all."""
    path = (root / "attachments" / "sheets" / ".dump" / spreadsheet_id
            / "formulas.tsv")
    if not path.is_file():
        return None
    lines = [line for line in path.read_text(encoding="utf-8").splitlines()
             if line.strip()]
    if not lines:
        return set()
    header = lines[0].split("\t")
    return {(row.get("sheet"), row.get("range")) for row in
            (dict(zip(header, line.split("\t"))) for line in lines[1:])}


def _instances_by_key(record):
    return {i["key"]: i for i in _data(record).get("instances") or []
            if isinstance(i, dict) and i.get("key")}


def _binding_gone(walk):
    """§3.1: a binding is never removed automatically — the audit reports one
    the dump no longer computes and `edit-fact` takes it out. The binding names
    its instance in its own key, the record it points at carries that instance,
    and `formulas.tsv` is the record of what the tab computes. A workbook with
    no dump is silent here: `dump_missing` already says so once."""
    items, ranges = [], {}
    for rule in _rules(walk):
        for member in _data(rule).get("applies_to") or []:
            if not isinstance(member, dict) or not member.get("range"):
                continue
            record = walk.by_id.get((member.get("record") or {}).get("ref"))
            instance = (_instances_by_key(record).get(
                str(member.get("key")).rsplit("__", 2)[0]) if record else None)
            if not instance or not instance.get("spreadsheetId"):
                continue                   # `_orphan_ref` owns the dangle
            spreadsheet = instance["spreadsheetId"]
            if spreadsheet not in ranges:
                ranges[spreadsheet] = _formula_ranges(walk.root, spreadsheet)
            held = ranges[spreadsheet]
            if held is None or (instance.get("sheet"), member["range"]) in held:
                continue
            items.append(_finding(
                "binding_gone", rule["id"],
                f"binding {member['key']} reads {member['range']} of "
                f"{instance.get('sheet')} in {spreadsheet}, which the latest "
                f"dump no longer computes"))
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
        # §5.1's consumer contract: "a settings constant — a par level, a
        # tolerance, a conversion factor, a threshold; a consumer is not
        # required". So this is a line for a reader, not a defect, and
        # `proposal: "info"` is how stage C tells the two apart.
        items.append(_finding(
            "unconsumed_constant", rule["id"],
            f"constant {rule['key']} is read by no rule and derives no "
            "record field", "info"))
    return items


QUANTITIES = ("mass", "count", "volume", "duration", "money", "ratio", "other")
UNRESOLVED_WORDS = ("نامشخص", "مشخص نیست", "معلوم نیست")


def _expr_missing(walk):
    """§5.3: `original` alone is not a legal state — a rule bound to a formula
    states the business computation as `expr`, a `table`, or `lang: text`. This
    is the count Gate B carries and QF-44 (v3) reads."""
    items = []
    for rule in _rules(walk):
        data = _data(rule)
        if not data.get("applies_to"):
            continue
        # `lang: text` IS the third legal state (§5.3): the computation is
        # stated in words, in `original`. The old `data.get("text")` looked for
        # a member no rule carries, so every text rule bound to a formula was
        # reported as stating no expression (dining's F-00039, 2026-09-08).
        if data.get("expr") or data.get("table") or data.get("lang") == "text":
            continue
        items.append(_finding("expr_missing", rule["id"],
                              f"rule {rule['key']} is bound to "
                              f"{len(data['applies_to'])} formulas and states "
                              f"no expression"))
    return items


def _equal_expr(walk):
    """§2.6 step 7: two rules stating one computation in one scope. U5 says one
    entry with all its bindings, so the second is either a duplicate the
    reviewer should merge or a divergence nobody declared."""
    groups = {}
    for rule in _rules(walk):
        expr = _data(rule).get("expr")
        if not isinstance(expr, str) or not expr.strip():
            continue
        scope = canonical_scope(rule.get("scope"))
        groups.setdefault(("".join(expr.split()), tuple(scope["departments"]),
                           tuple(scope["branches"])), []).append((rule["id"],
                                                                  expr))
    items = []
    for _key, stated in groups.items():
        if len(stated) < 2:
            continue
        # The expression as the lowest-id rule spells it, not the whitespace-
        # stripped grouping key: the reader has to find this sentence in the
        # entry, and «v=x» is not what the entry says.
        stated = sorted(stated)
        items.append(_finding("equal_expr", stated[0][0],
                              f"{', '.join(i for i, _e in stated)} state one "
                              f"expression: {stated[0][1]}"))
    return items


def _duplicate_code(walk):
    """`#N` and `##N` are the estate's own identifiers (§2.3); two open items
    answering to one of them is a merge the reviewer missed."""
    groups = {}
    for item in walk.open:
        code = _data(item).get("code") if item["kind"] == "item" else None
        if code:
            groups.setdefault(str(code), []).append(item["id"])
    items = []
    for code, ids in groups.items():
        if len(ids) < 2:
            continue
        items.append(_finding("duplicate_code", sorted(ids)[0],
                              f"code {code} is carried by "
                              f"{', '.join(sorted(ids))}"))
    return items


def _edge_disagreement(walk):
    """Two edge cases stating one input and expecting two different answers —
    within one rule, or between a rule and the template it declares. The ladder
    dedups `edge_cases` on `input`, so a pair like this arrives only from one
    assembly merging two units' readings, which is exactly the contradiction
    the reviewer is there to settle."""
    items = []
    for rule in _rules(walk):
        family = [rule]
        target = walk.by_id.get((_data(rule).get("template_of") or {}).get("ref"))
        if target is not None and target.get("kind") == "rule":
            family.append(target)
        stated = {}
        for member in family:
            for case in _data(member).get("edge_cases") or []:
                if isinstance(case, dict) and case.get("input") is not None:
                    stated.setdefault(_fold(case["input"]), set()).add(
                        str(case.get("expected")))
        for shape, expected in sorted(stated.items()):
            if len(expected) < 2:
                continue
            items.append(_finding(
                "edge_disagreement", rule["id"],
                f"edge case {shape!r} expects {' and '.join(sorted(expected))}"))
    return items


def _no_consumer(walk):
    """§4: an item nothing references — no rule reads it, no measurement
    measures it, no `refItems` cell resolves to it. Either the estate stopped
    using it, or it is a code minted with no home."""
    referenced = {obj["ref"] for entry in walk.open
                  for obj in iter_ref_objects(entry)
                  if isinstance(obj.get("ref"), str)}
    keys = set()
    for record in _records(walk):
        columns = [f["key"] for f in _data(record).get("fields") or []
                   if isinstance(f, dict) and f.get("refItems") and f.get("key")]
        for row in _rows(record):
            for column in columns:
                if isinstance(row.get(column), str):
                    keys.add(row[column])
    items = []
    for item in walk.open:
        if item["kind"] != "item" or item["id"] in referenced \
                or item["key"] in keys:
            continue
        items.append(_finding("no_consumer", item["id"],
                              f"item {item['key']} is read by no rule, record "
                              f"or measurement"))
    return items


def _quantity_off_enum(walk):
    """§3.3 closes `measurement.quantity` to a KIND of quantity. The schema
    refuses a new one at the door; this reports one the store already holds —
    including the v2 failure of writing a number where the kind belongs."""
    items = []
    for entry in walk.open:
        if entry["kind"] != "measurement":
            continue
        quantity = _data(entry).get("quantity")
        if quantity in QUANTITIES:
            continue
        items.append(_finding("quantity_off_enum", entry["id"],
                              f"quantity {quantity!r} is not one of "
                              f"{', '.join(QUANTITIES)}"))
    return items


def _note_targets_retired(walk):
    """QF-9 (v3): a note points at entries and asks something. One whose target
    is closed asks about a definition nobody reads any more."""
    items = []
    for note in walk.open:
        if note["kind"] != "note":
            continue
        for target in _data(note).get("about") or []:
            ref = target.get("ref") if isinstance(target, dict) else None
            entry = walk.by_id.get(ref)
            if entry is None or is_open(entry):
                continue                   # `_orphan_ref` owns the dangle
            items.append(_finding(
                "note_targets_retired", note["id"],
                f"note {note['key']} asks about {ref}, retired "
                f"{entry.get('valid_to') or ''}".rstrip()))
    return items


def _import_unresolved(walk):
    """QF-48: an `imports[].source` still a locator. §10 lets one stand
    indefinitely — the source department may never run — so this is a line for
    whoever wants the edge closed, not a defect."""
    items = []
    for record in _records(walk):
        for instance in _data(record).get("instances") or []:
            if not isinstance(instance, dict):
                continue
            for member in instance.get("imports") or []:
                source = member.get("source") if isinstance(member, dict) else None
                if not isinstance(source, dict) or source.get("ref"):
                    continue
                items.append(_finding(
                    "import_unresolved", record["id"],
                    f"instance {instance.get('key')} imports "
                    f"{source.get('sheet')} of {source.get('spreadsheetId')} "
                    f"by locator, not by reference"))
    return items


def _stale_prose(walk):
    """§4: a field somebody settled whose statement still calls it unresolved.
    `resolve` writes the chosen value into the leaf, and §11's prose rule
    writes a statement once and never rewrites it — so the panel ends up
    showing a settled number under a sentence saying nobody knows."""
    words = [_fold(w) for w in UNRESOLVED_WORDS]
    items = []
    for entry in walk.open:
        settled = any(a.get("status") == "chosen"
                      for a in entry.get("accounts") or [] if isinstance(a, dict))
        if not settled or open_accounts(entry):
            continue
        statement = _fold(entry.get("statement") or "")
        if not any(word in statement for word in words):
            continue
        items.append(_finding("stale_prose", entry["id"],
                              f"{entry['key']}'s statement still calls a "
                              f"settled field unresolved"))
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
            "note_overlap", ids[0],
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


def _process_roles(root):
    """The vocabulary the process side already holds: every `actor` and every
    `mechanisms` member of every LIVE process file (§15).

    I3: a tombstoned process is invisible as content everywhere else — a
    citation into one is refused, a link into one is a finding — so its actor
    cannot be what makes a role known here either."""
    roles = set()
    departments = root / "departments"
    if not departments.is_dir():
        return roles
    for path in sorted(departments.glob("*/processes/*.json")):
        try:
            doc = read_json(path)
        except (OSError, ValueError):
            continue
        if doc.get("tombstoned"):
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


#: The six §2.6 step 7 flags — every one of them reads nothing off disk, so
#: `assemble` can run them over the store plus the entries it is about to
#: write. One implementation, one set of codes: the audit and the digest
#: cannot drift.
FLAG_CHECKS = (_duplicate_output, _lookalike_title, _recurring_note_shape,
               _equal_expr, _duplicate_code, _edge_disagreement)

AUDIT_CHECKS = FLAG_CHECKS + (
    _orphan_ref, _dangling_ref_items, _process_link, _row_gone, _binding_gone,
    _expr_missing, _retired_row_live_edges, _template_drift, _reconciliation,
    _component_sum, _unconsumed_constant, _no_consumer, _quantity_off_enum,
    _note_targets_retired, _import_unresolved, _stale_prose, _stale_stub,
    _natural_key_dup, _scope_shadow, _unknown_role)


def flags_over(root, entries):
    """§2.6 step 7: the six disk-free checks over `load_store` plus the entries
    an assembly is about to write. `entries` must already carry ids (the
    assembly's temp ids are fine — that is why step 1 mints them first). The
    store is read and never written."""
    root = pathlib.Path(root)
    store = load_store(root)
    for entry in entries:
        store[entry["kind"]]["entries"].append(entry)
    walk = _Walk(root, store)
    items = []
    for check_fn in FLAG_CHECKS:
        items.extend(check_fn(walk))
    return _sorted(items)


def _sorted(items):
    return sorted(items, key=lambda i: (i["code"], i["id"] or "", i["message"]))


#: One Persian sentence per finding kind (§2.1 stage C). The playbook prints
#: these and nothing else — the owner never sees a code, an id, a path or a
#: column letter, and the coordinator composes no prose of its own (QF-54).
PERSIAN = {
    "two_writers": "دو قاعده روی یک ستون کار می‌کنند: «{title}»",
    "duplicate_title": "عنوان تکراری: «{title}»",
    "note_overlap": "یادداشت‌های هم‌شکل: «{title}»",
    "equal_expr": "دو قاعده یک محاسبه را می‌گویند: «{title}»",
    "duplicate_code": "یک کد برای دو قلم: «{title}»",
    "edge_disagreement": "برای یک نمونه دو پاسخ آمده است: «{title}»",
    "orphan_ref": "ارجاع بی‌مقصد: «{title}»",
    "dangling_ref_items": "ارجاع به قلمی که دیگر نیست: «{title}»",
    "process_link": "پیوند با فرایندی که تغییر کرده است: «{title}»",
    "row_gone": "ردیفی که دیگر در فایل نیست: «{title}»",
    "dump_missing": "فایل این جدول هنوز خوانده نشده است: «{title}»",
    "binding_gone": "فرمولی که دیگر در فایل نیست: «{title}»",
    "expr_missing": "قاعده‌ای که محاسبه‌اش نوشته نشده است: «{title}»",
    "retired_row_live_edges": "ردیف بازنشسته که هنوز خوانده می‌شود: «{title}»",
    "template_drift": "نمونه‌ای که از الگویش فاصله گرفته است: «{title}»",
    "reconciliation": "عدد جدول با عدد قاعده نمی‌خواند: «{title}»",
    "component_sum": "جمع سهم‌ها یک نمی‌شود: «{title}»",
    "unconsumed_constant": "عددی که هیچ قاعده‌ای آن را نمی‌خواند: «{title}»",
    "no_consumer": "قلمی که هیچ‌جا استفاده نشده است: «{title}»",
    "quantity_off_enum": "نوع کمیت شناخته نیست: «{title}»",
    "note_targets_retired": "یادداشتی دربارهٔ مورد بازنشسته: «{title}»",
    "import_unresolved": "ورودی از فایلی که هنوز خوانده نشده است: «{title}»",
    "stale_prose": "شرح با مقدار تعیین‌شده نمی‌خواند: «{title}»",
    "stale_stub": "فایلی که هیچ‌وقت خوانده نشد: «{title}»",
    "natural_key_dup": "یک کلید برای دو مورد: «{title}»",
    "scope_shadow": "همین کلید در دامنهٔ عمومی هم هست: «{title}»",
    "unknown_role": "نقشی که در فرایندها نیامده است: «{title}»",
    "source_moved": "پروندهٔ استنادشده عوض شده است: «{title}»",
    "estate_absent": "پروندهٔ Excel روی این دستگاه نیست: «{title}»",
    "uncited_workbook": "فایلی که هیچ جدولی از آن خوانده نشده است: «{title}»",
}


def audit(root, persian=False):
    """§12's `audit` row, every check of it, over one read of the store.

    `persian=True` re-renders each finding for stage C from the entry's own
    title and the finding's kind — the message a code has no template for falls
    back to the title alone, which is still owner-safe."""
    walk = _Walk(pathlib.Path(root), load_store(root))
    items = []
    for check_fn in AUDIT_CHECKS:
        items.extend(check_fn(walk))
    items = _sorted(items)
    if persian:
        for item in items:
            title = (walk.by_id.get(item["id"]) or {}).get("title") or "—"
            item["message"] = PERSIAN.get(item["code"],
                                          "بررسی لازم است: «{title}»").format(
                title=title)
    return items


# --------------------------------------------------------------------------- #
# check — the sources on disk, and QF-44 (v3)'s readiness
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


def _latest_runs(root):
    """The newest run directory of every department under `runs/facts/` — the
    run whose units and review answer QF-44 (v3)."""
    base = root / "runs" / "facts"
    out = []
    if not base.is_dir():
        return out
    for department in sorted(p for p in base.iterdir() if p.is_dir()):
        stamps = sorted(p for p in department.iterdir() if p.is_dir())
        if stamps:
            out.append(stamps[-1])
    return out


def _run_units(run_dir):
    try:
        return read_json(run_dir / "meta.json").get("units") or []
    except (OSError, ValueError):
        return []


def _lint_failures(walk):
    """Entries whose own prose fails §5.2's lint, counted per ENTRY — QF-44
    (v3) asks that no entry carries a failure, not how many words each one
    broke. «ستون», «تب» and «سلول» are allowed in a record's own statement
    (QF-50), so records are linted with the sheet words admitted."""
    exemptions = _unit_row_keys(walk.store, [])
    failing = 0
    for entry in walk.open:
        problems = lint_prose(entry.get("title") or "", exemptions=exemptions)
        problems += lint_prose(entry.get("statement") or "",
                               exemptions=exemptions,
                               allow_sheet_words=entry["kind"] == "record")
        if problems:
            failing += 1
    return failing


def check(root):
    """§12's `check` row and QF-44 (v3)'s readiness in one dict.

    `findings` is what it always was — the citations that moved, the estate
    files that are not here, the manifest workbooks nothing has read. Beside it
    are the five readiness answers. The workbook-coverage metric is withdrawn
    (§4): a department is ready when its units are done, its review has run,
    and nothing is lint-failing, expression-less or still disputed — none of
    which a denominator over the manifest ever measured.

    With no run directory at all both `units_done` and `review_ran` answer over
    an empty set, so they are vacuously true and false respectively: nothing is
    pending, and no review has run.
    """
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
    runs = _latest_runs(root)
    units = [u for run in runs for u in _run_units(run)]
    return {"findings": _sorted(items),
            "units_done": all(u.get("state") == "done" for u in units),
            "review_ran": all((run / "review" / "out.json").is_file()
                              for run in runs) if runs else False,
            "lint_failures": _lint_failures(walk),
            "expr_missing": len(_expr_missing(walk)),
            "open_disputes": sum(len(open_accounts(e)) for e in walk.open)}
