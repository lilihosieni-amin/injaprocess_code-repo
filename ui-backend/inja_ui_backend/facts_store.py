"""Reading the facts store (spec §16, QF-24).

Pure filesystem reads, and no writes: `facts/**` in the live data-repo is
written only by `merge facts` (QF-2, CLAUDE.md's hard rule), and this module
is not an exception to it.

Beside the two loaders the confirmation gate needs, this module builds the
bundles a *served* entry needs: `resolved`, `row_titles` and `path_labels`,
which between them cover every id, item key, row key and red path an entry
references, so no screen can fall back to a raw key (spec §17); plus
`red_paths`, `consumers`, `process_links` and `coverage`.

Two disciplines run through all of it:

- **Nothing raises.** These run inside request handling, and `access.py`'s
  rule holds here too — a crash is a denial of service, and an unanswerable
  question is a value. An absent store, an absent manifest, an absent
  `departments/` tree, a dangling `{ref}`, a malformed file: each is an
  omission or a `None`, never an exception. The maps are best-effort, and a
  dangling ref simply has no entry — no invented Persian stands in for a
  target that is gone.
- **Persian is copied, never composed from English.** Every label here comes
  from the entry itself (`fields[].title`, `outputs[].title`, an item's
  `title`) or verbatim from Appendix D. A leaf the appendix does not name
  keeps its ASCII key rather than gaining a translation nobody approved.
"""
from __future__ import annotations

import re
from pathlib import Path

from . import storage
from .store import manifest

#: QF-37's two id namespaces, anchored — a `{ref}` is a fact reference or a
#: process reference by its id grammar, never by a prefix test.
_FACT_ID_RE = re.compile(r"^(F-[0-9]{5}|T-[0-9]+)$")
_PROC_ID_RE = re.compile(r"^[a-z]+-[0-9]{3}$")

#: The payload groups whose members carry `{key, title}` — a path's second
#: segment when the path names a column, an input or an output.
_KEYED_GROUPS = ("fields", "header_fields", "inputs", "outputs")

#: Appendix D's payload-field labels, for a red path whose leaf no `fields[]`,
#: `inputs[]` or `outputs[]` member names. Verbatim from the appendix; a leaf
#: it does not label keeps its key (see the module docstring).
_LEAF_LABELS: dict[str, str] = {
    "unit": "واحد", "unit_raw": "واحد به نوشتهٔ منبع",
    "value": "مقدار", "range": "بازه", "min": "کمینه", "max": "بیشینه",
    "share": "سهم", "per": "به ازای هر", "of": "برای", "expr": "فرمول",
    "from": "خوانده می‌شود از", "via": "با تبدیل واحد",
    "calls": "فراخوانی‌ها", "identifier": "نام تابع",
    "original": "متن اصلی", "original_ref": "متن اصلی",
    "port": "باید عیناً در ERP پیاده شود",
    "template_of": "الگو", "divergence": "تفاوت با الگو",
}

#: Kind -> file, the plural of the kind name (spec §4, "Storage layout").
_FILES: dict[str, str] = {
    "item": "items.json",
    "record": "records.json",
    "measurement": "measurements.json",
    "rule": "rules.json",
    "note": "notes.json",
}


def load_index(root: Path) -> dict:
    """`facts/.index.json`, as stored — no derived additions.

    An absent file reads as an empty store rather than raising: every
    deployment is in exactly this state until the first `merge facts` run,
    and this sits inside the confirm gate (`_fact_departments`), before any
    scope decision — a crash there is a 500, not the uniform 404 an absent id
    must answer (`access.py`'s own rule: a crash is a denial of service, and
    an unanswerable question is a value, never an exception). A fresh dict
    each call, like `storage.read_json`'s own return — never a shared
    module-level default a caller's `["entries"].append(...)` could corrupt
    for every later call in the process.
    """
    path = Path(root) / "facts" / ".index.json"
    if not path.is_file():
        return {"schema_version": 1, "entries": []}
    return storage.read_json(path)


def load_entry(root: Path, fact_id: str) -> dict | None:
    """The envelope `fact_id` names, or `None`.

    The index row's `kind` picks which of the five files to open; when the
    index and a store file disagree about an entry's kind, the file is the
    truth for content, so this uses the index only to find the file, never to
    answer anything about what is inside it. `None`, never an exception, both
    when the id is absent from the index and when the file the index row
    points at does not carry it — a caller (the confirm gate among them) can
    treat "not found" as one case rather than two. That same "never an
    exception" holds for a malformed row too — one missing `id` or naming a
    `kind` outside the five (a hand-edited or partially-migrated store) reads
    as "not found" rather than a `KeyError`, for the same reason: the gate
    that calls this must fail closed, not crash.
    """
    row = next((r for r in load_index(root)["entries"] if r.get("id") == fact_id),
              None)
    if row is None:
        return None
    filename = _FILES.get(row.get("kind"))
    if filename is None:
        return None
    path = Path(root) / "facts" / filename
    if not path.is_file():
        return None
    doc = storage.read_json(path)
    return next((e for e in doc.get("entries", []) if e.get("id") == fact_id), None)


def load_all(root: Path) -> list[dict]:
    """Every entry in the store, kind by kind.

    The index would be cheaper, but it carries no `data` — and every bundle
    below is a walk over payloads (`refItems` cells, `inputs[].from`, an
    item's `code`). A file that is absent or unreadable contributes nothing
    rather than taking the request down with it.
    """
    # ponytail: no cache — one detail request re-reads the five files once per
    # bundle it asks for. Memoise per request (or per store mtime) if the store
    # grows past a few thousand entries; today it is five small JSON files.
    out: list[dict] = []
    for filename in _FILES.values():
        path = Path(root) / "facts" / filename
        if not path.is_file():
            continue
        try:
            doc = storage.read_json(path)
        except (OSError, ValueError):
            continue
        entries = doc.get("entries") if isinstance(doc, dict) else None
        out.extend(e for e in entries or [] if isinstance(e, dict))
    return out


def iter_ref_objects(obj):
    """Every nested dict whose keys are a subset of `{ref, field, row}` with
    `ref` (QF-37's shape test), in document order.

    The engine's `merge_facts.iter_ref_objects`, reimplemented rather than
    imported: the ui-backend never imports the engine package (CLAUDE.md).
    Like the original it does **not** descend into a ref-shaped dict's own
    values, and it yields `processes[]` and the supersession links too — they
    share the shape but live in the other id namespace, so callers filter by
    id grammar (`_FACT_ID_RE`, `_PROC_ID_RE`).
    """
    if isinstance(obj, dict):
        if "ref" in obj and set(obj) <= {"ref", "field", "row"}:
            yield obj
        else:
            for value in obj.values():
                yield from iter_ref_objects(value)
    elif isinstance(obj, list):
        for member in obj:
            yield from iter_ref_objects(member)


def _null_paths(entry: dict) -> list[str]:
    """QF-6: a `null` leaf inside `data` is `unknown`; an absent key is not.

    QF-7's path grammar addresses dict fields and keyed array members only, so
    a `null` inside a member with no `key` has no path and is not counted —
    it cannot be disputed, resolved, or named in `field_status`. The engine's
    `null_paths` counts exactly the same set; the two must agree, because the
    red count a reviewer sees here is the one `merge facts` derived `status`
    from.
    """
    out: list[str] = []

    def walk(value, prefix):
        if value is None:
            out.append(prefix)
        elif isinstance(value, dict):
            for key, member in value.items():
                walk(member, f"{prefix}/{key}")
        elif isinstance(value, list):
            for member in value:
                if isinstance(member, dict) and "key" in member:
                    walk({k: v for k, v in member.items() if k != "key"},
                         f"{prefix}/{member['key']}")

    walk(entry.get("data") or {}, "data")
    return out


def red_paths(entry: dict) -> dict:
    """`{"unknown": [paths], "disputed": [paths]}` — the entry's red set.

    The two halves have different sources: `unknown` is every addressable
    `null` leaf, `disputed` every **open** account's field. A `chosen` or
    `rejected` account is settled and is not red (it still gets a
    `path_labels` label, because the accounts card shows the settled ones
    too).
    """
    accounts = entry.get("accounts") or []
    return {
        "unknown": _null_paths(entry),
        "disputed": sorted({a["field"] for a in accounts
                            if isinstance(a, dict) and a.get("status") == "open"
                            and isinstance(a.get("field"), str)}),
    }


def _labels(root: Path) -> dict[str, dict]:
    """`id -> {kind, title, code?}`, and an item's **key** to the same label.

    Both are needed because the store references items two ways: a `{ref}`
    names the id, while a `refItems` cell holds the item's key (QF-37's one
    exception, so a reference row's key stays derivable). The two namespaces
    cannot collide — ids are `F-…`, keys are lower-case.
    """
    out: dict[str, dict] = {}
    for entry in load_all(root):
        label = {"kind": entry.get("kind"), "title": entry.get("title")}
        code = (entry.get("data") or {}).get("code")
        if entry.get("kind") == "item" and code:
            label["code"] = str(code)
        if isinstance(entry.get("id"), str):
            out[entry["id"]] = label
        if entry.get("kind") == "item" and isinstance(entry.get("key"), str):
            out[entry["key"]] = label
    return out


def _process_doc(root: Path, process_id: str) -> dict | None:
    """A process file read live from `departments/**` (QF-8 §2), or `None`.

    Live, and not from anything cached in the fact entry: the whole point of
    the link is to notice that the process has since been tombstoned.
    """
    if not _PROC_ID_RE.match(process_id or ""):
        return None
    path = storage.proc_path(root, process_id)
    if not path.is_file():
        return None
    try:
        doc = storage.read_json(path)
    except (OSError, ValueError):
        return None
    return doc if isinstance(doc, dict) else None


def _heir(doc: dict) -> str | None:
    """A process doc's `superseded_by` is a list (`restructure` writes several
    heirs); a hand-written one may carry the bare id."""
    heirs = doc.get("superseded_by")
    if isinstance(heirs, str):
        return heirs
    if isinstance(heirs, list) and heirs:
        return str(heirs[0])
    return None


def _process_refs(entry: dict) -> list[str]:
    return [p["ref"] for p in entry.get("processes") or []
            if isinstance(p, dict) and isinstance(p.get("ref"), str)
            and _PROC_ID_RE.match(p["ref"])]


def _ref_item_columns(data: dict) -> list[str]:
    """The declared columns whose cells hold an item key, in declared order."""
    return [f["key"] for f in data.get("fields") or []
            if isinstance(f, dict) and f.get("refItems")
            and isinstance(f.get("key"), str)]


def resolved_map(root: Path, entry: dict) -> dict:
    """Every id, item key and process id the entry points at → `{kind, title,
    code?}` (spec §17).

    The walk is over the **whole envelope**, not only `data`: `supersedes`,
    `superseded_by` and `issues[].affects` are `{ref}` objects too, and the
    detail screen renders their titles beside the payload's. A target that is
    gone is absent from the map — see the module docstring.
    """
    labels = _labels(root)
    found = {}
    for obj in iter_ref_objects(entry):
        ref = obj.get("ref")
        if isinstance(ref, str) and _FACT_ID_RE.match(ref) and ref in labels:
            found[ref] = labels[ref]
    data = entry.get("data") or {}
    for column in _ref_item_columns(data):
        for row in data.get("rows") or []:
            cell = row.get(column) if isinstance(row, dict) else None
            if isinstance(cell, str) and cell in labels:
                found[cell] = labels[cell]
    for ref in _process_refs(entry):
        doc = _process_doc(root, ref)
        if doc is not None and doc.get("name"):
            found[ref] = {"kind": "process", "title": doc["name"]}
    return found


def row_titles(root: Path, entry: dict) -> dict:
    """`row key -> the row's Persian title` (spec §17).

    A log's fixed rows carry their own `title`. A reference table's do not:
    the row *is* its cells, so the title is composed from the titles of its
    `refItems` columns in `primaryKey` order — `prod_61__ing_41` → «اینجا
    پیتزا — قارچ» (§9). Every row key is in the map, so a caller can render
    `row_titles[key]` unconditionally; a row whose cells resolve to nothing
    maps to its own key rather than to invented Persian.
    """
    data = entry.get("data") or {}
    rows = [r for r in data.get("rows") or []
            if isinstance(r, dict) and isinstance(r.get("key"), str)]
    if not rows:
        return {}
    columns = _ref_item_columns(data)
    order = [k for k in data.get("primaryKey") or [] if k in columns] or columns
    labels = _labels(root) if order else {}
    out = {}
    for row in rows:
        if isinstance(row.get("title"), str) and row["title"]:
            out[row["key"]] = row["title"]
            continue
        parts = [labels[row[c]]["title"] for c in order
                 if isinstance(row.get(c), str)
                 and labels.get(row[c], {}).get("title")]
        out[row["key"]] = " — ".join(parts) if parts else row["key"]
    return out


def _field_title(entry: dict, key: str) -> str:
    """A column's, input's or output's Persian title — the entry's own word
    for it (QF-42), falling back to Appendix D and then to the key."""
    data = entry.get("data") or {}
    for group in _KEYED_GROUPS:
        for member in data.get(group) or []:
            if isinstance(member, dict) and member.get("key") == key:
                title = member.get("title")
                if isinstance(title, str) and title:
                    return title
    return _LEAF_LABELS.get(key, key)


def _path_label(entry: dict, path: str, titles: dict) -> str:
    """One QF-7 path → what a reviewer reads instead of it."""
    seg = path.split("/")
    leaf = _LEAF_LABELS.get(seg[-1], seg[-1])
    if seg[:2] == ["data", "rows"] and len(seg) >= 4:
        # «ستون — ردیف» (Appendix D): the reference-table cell, which is the
        # shape the red cards and the accounts card are built around.
        return f"{_field_title(entry, seg[3])} — {titles.get(seg[2], seg[2])}"
    if seg[0] == "data" and len(seg) >= 3 and seg[1] in _KEYED_GROUPS:
        column = _field_title(entry, seg[2])
        return column if len(seg) == 3 else f"{column} › {leaf}"
    if seg[0] == "data" and len(seg) == 2:
        return leaf
    return path


def path_labels(root: Path, entry: dict) -> dict:
    """Every red path, account field and reconciled cell → a Persian label.

    Exactly those three sources, and not every path in the entry: these are
    the paths a screen names out loud — the red cards, the accounts card
    grouped by disputed field (§14.4), and the reconciliation row.
    """
    data = entry.get("data") or {}
    red = red_paths(entry)
    paths = set(red["unknown"]) | set(red["disputed"])
    paths |= {a["field"] for a in entry.get("accounts") or []
              if isinstance(a, dict) and isinstance(a.get("field"), str)}
    for pair in data.get("reconciled_against") or []:
        cell = pair.get("cell") if isinstance(pair, dict) else None
        if isinstance(cell, dict) and cell.get("row") and cell.get("field"):
            paths.add(f"data/rows/{cell['row']}/{cell['field']}")
    titles = row_titles(root, entry)
    return {p: _path_label(entry, p, titles) for p in sorted(paths)}


def _consumes(data: dict, fact_id: str, item_key: str | None) -> bool:
    """Does this payload read from, write to, or otherwise consume the target?

    QF-37's seven consuming edges, and no others: `of`, `mirror_of` and
    `supersedes` point at a target too but do not *use* it, and this list
    exists to answer "what breaks if this changes".
    """
    def hits(obj) -> bool:
        return isinstance(obj, dict) and obj.get("ref") == fact_id

    for member in data.get("inputs") or []:                    # 1 from, 2 via
        if isinstance(member, dict) and (hits(member.get("from"))
                                         or hits(member.get("via"))):
            return True
    if any(hits(c) for c in data.get("calls") or []):          # 3 calls[]
        return True
    if hits(data.get("writes_to")):                            # 4 writes_to —
        return True                                            # a measurement's
    for member in data.get("outputs") or []:                   # 4 writes_to —
        if isinstance(member, dict) and hits(member.get("writes_to")):
            return True                                        # a rule output's
    for member in data.get("fields") or []:                    # 5 derived
        if isinstance(member, dict) and hits(member.get("derived")):
            return True
    if item_key:                                               # 6 refItems cell
        for column in _ref_item_columns(data):
            if any(isinstance(r, dict) and r.get(column) == item_key
                   for r in data.get("rows") or []):
                return True
    for pair in data.get("reconciled_against") or []:          # 7 reconciled
        if isinstance(pair, dict) and hits(pair.get("against")):
            return True
    return False


def consumers(root: Path, fact_id: str) -> list:
    """`[{"id", "title"}]` — the entries that read or write this one.

    Ordered by id, so two calls over one store answer in the same order. The
    `refItems` join is on the target's **key**, not its id (QF-37's one
    exception), which is why the target itself is found first.
    """
    entries = load_all(root)
    target = next((e for e in entries if e.get("id") == fact_id), None)
    item_key = None
    if target is not None and target.get("kind") == "item":
        key = target.get("key")
        item_key = key if isinstance(key, str) else None
    return sorted(({"id": e["id"], "title": e.get("title")}
                   for e in entries
                   if isinstance(e.get("id"), str)
                   and _consumes(e.get("data") or {}, fact_id, item_key)),
                  key=lambda row: row["id"])


def process_links(root: Path, entry: dict) -> list:
    """`[{"ref", "title", "tombstoned", "heir"}]` — the entry's process links,
    resolved against `departments/**` as it is now (QF-8 §2).

    A tombstoned process carries its heir, so the screen can offer the
    re-point the audit proposes; a link whose file is gone answers with a
    `None` title, which is what "the process this cites is no longer there"
    looks like to a reader.
    """
    out = []
    for ref in _process_refs(entry):
        doc = _process_doc(root, ref) or {}
        out.append({"ref": ref, "title": doc.get("name"),
                    "tombstoned": bool(doc.get("tombstoned")),
                    "heir": _heir(doc) if doc.get("tombstoned") else None})
    return out


def coverage(root: Path) -> dict:
    """`{"read": n, "total": m}` — how much of the estate has been read.

    The same count `merge facts check` reports (§12), joined the same way: a
    workbook is *read* when a **non-stub** `record` names its `spreadsheetId`
    in `data.location`. A stub is identity and nothing else (QF-20), so it
    reads nothing; a retired record still counts, because the reading did
    happen and the tab going away does not un-read the workbook.
    """
    cited = set()
    for entry in load_all(root):
        data = entry.get("data") or {}
        spreadsheet = (data.get("location") or {}).get("spreadsheetId")
        if entry.get("kind") == "record" and spreadsheet and not data.get("stub"):
            cited.add(spreadsheet)
    workbooks = [w for w in manifest.read_manifest(root).get("workbooks") or []
                 if isinstance(w, dict)]
    return {"read": sum(1 for w in workbooks if w.get("spreadsheetId") in cited),
            "total": len(workbooks)}
