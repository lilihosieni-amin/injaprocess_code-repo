"""Reading the facts store (spec §16, QF-24).

Pure filesystem reads, and no writes: `facts/**` in the live data-repo is
written only by `merge facts` (QF-2, CLAUDE.md's hard rule), and this module
is not an exception to it.

Beside the two loaders the confirmation gate needs, this module builds the
bundles a *served* entry needs: `resolved`, `row_titles` and `path_labels`,
which between them cover every id, row key and red path an entry references,
so no screen can fall back to a raw key (spec §17); plus `red_paths`,
`consumers`, `subsets`, `process_links` and `coverage`.

Two disciplines run through all of it:

- **Nothing raises.** These run inside request handling, and `access.py`'s
  rule holds here too — a crash is a denial of service, and an unanswerable
  question is a value. An absent store, an absent manifest, an absent
  `departments/` tree, a dangling `{ref}`, a malformed file: each is an
  omission or a `None`, never an exception. The maps are best-effort, and a
  dangling ref simply has no entry — no invented Persian stands in for a
  target that is gone.
- **Persian is copied, never composed from English.** Every label here comes
  from the entry itself (`fields[].title`, `outputs[].title`, a row's
  `title`) or verbatim from Appendix D, whose payload-field table is
  transcribed whole rather than sampled — the appendix decides which names
  have a label, not which ones a red path happened to need. A name it does
  not carry keeps its ASCII key rather than gaining a translation nobody
  approved, but no path is ever printed raw: `_path_label` composes one out
  of the segments it can name.
"""
from __future__ import annotations

import re
from pathlib import Path, PurePosixPath

from . import storage
from .store import manifest

#: QF-37's two id namespaces — a `{ref}` is a fact reference or a process
#: reference by its id grammar, never by a prefix test. Matched with
#: `fullmatch` and written without anchors: `re.match` on `…$` still accepts a
#: trailing newline, which is anchored-but-one-character-loose.
_FACT_ID_RE = re.compile(r"F-[0-9]{5}|T-[0-9]+")
_PROC_ID_RE = re.compile(r"[a-z]+-[0-9]{3}")

#: The payload groups whose members carry `{key, title}` — a path's second
#: segment when the path names a column, an input or an output.
_KEYED_GROUPS = ("fields", "header_fields", "inputs", "outputs")

#: Appendix D's payload-field **and envelope** tables, transcribed whole and
#: verbatim: every name they label, so that no path a screen names out loud
#: can come out as an ASCII key. A name the appendix does not carry keeps its key rather than
#: gaining a translation nobody approved (see the module docstring) — but the
#: appendix is the authority on which names those are, not what a red path
#: happened to need on the day this was written.
_LEAF_LABELS: dict[str, str] = {
    # rule
    "inputs": "ورودی‌ها", "outputs": "خروجی‌ها", "expr": "فرمول",
    "value": "مقدار", "range": "بازه", "min": "کمینه", "max": "بیشینه",
    "unit": "واحد", "unit_raw": "واحد به نوشتهٔ منبع",
    "per": "به ازای هر", "of": "برای", "writes_to": "ثبت در",
    "from": "خوانده می‌شود از", "via": "با تبدیل واحد", "share": "سهم",
    "calls": "فراخوانی‌ها", "identifier": "نام تابع",
    "original": "متن اصلی", "original_ref": "متن اصلی",
    "port": "باید عیناً در ERP پیاده شود",
    "edge_cases": "موارد خاص", "input": "ورودی",
    "expected": "خروجی مورد انتظار", "why": "چرا",
    "template_of": "الگو", "divergence": "تفاوت با الگو",
    # record — structure
    "fields": "ستون‌ها", "header_fields": "فیلدهای سربرگ", "rows": "ردیف‌ها",
    "sections": "بخش‌ها", "signatures": "امضاها",
    "title": "عنوان", "key": "کلید", "type": "نوع",
    "constraints": "محدودیت‌ها", "derived": "محاسبه‌شده با", "group": "گروه",
    "filled_by": "تکمیل‌کننده", "refItems": "ارجاع به آیتم",
    "enum": "مقادیر مجاز", "readOnly": "فقط‌خواندنی", "required": "اجباری",
    "minimum": "کمینه", "maximum": "بیشینه",
    "section": "بخش", "when": "زمان", "open": "ردیف باز",
    "doc_number_field": "فیلد شمارهٔ سند",
    # A row's own lifecycle (§9). Appendix D lists these in its *envelope*
    # table, but a `rows[]` member carries them as its own leaves, where they
    # are ordinary payload paths — `data/rows/{key}/valid_to` is a red path
    # like any other, and was reading as its ASCII key.
    "retired": "بازنشسته", "valid_from": "معتبر از", "valid_to": "معتبر تا",
    "supersedes": "جایگزینِ", "superseded_by": "جایگزین‌شده با",
    "primaryKey": "کلید اصلی", "foreignKeys": "ارتباط با جدول دیگر",
    "reference_fields": "ستون‌های مقابل", "transform": "تبدیل",
    # record — place and lifecycle
    "location": "محل",
    # §3.3's non-sheet locations: a paper form and an external table have no
    # path and no tab, and what says where they are is where they are kept,
    # who holds them, and which system they live in.
    "kept_at": "نگهداری", "holder": "مسئول", "system": "سامانه",
    "path": "مسیر", "spreadsheetId": "شناسهٔ فایل",
    "sheet": "برگه", "sheetId": "شمارهٔ برگه", "hidden": "مخفی",
    "identifier_scheme": "شیوهٔ شناسه",
    "blank_master": "برگهٔ خالی برای پر کردن", "grain": "هر ردیف یعنی",
    "cadence": "تناوب", "day_boundary": "مرز روز کاری",
    "approved_by": "تأییدکنندهٔ فرم", "mirror_of": "نسخه‌ای از",
    "reconciled_against": "تطبیق با مقدار ثابت", "cell": "سلول",
    "against": "مقدار ثابت",
    "movement": "انتقال", "to": "به", "reason": "دلیل",
    # measurement
    "method": "روش", "by": "توسط", "exceptions": "استثناها",
    # item
    "code": "کد", "code_absent": "بدون کد", "category": "دسته",
    "state": "حالت", "grade": "درجه",
    "pack": "بسته", "size": "تعداد", "units": "واحدهای بسته‌بندی",
    "pack_unit": "واحد بسته", "factor_to_base": "ضریب تبدیل به واحد پایه",
    "tracked": "ردیابی", "record": "در جدول",
    "stub": "پیش‌ثبت",
    # envelope — QF-7 lists `title` and `scope` as leaves beside `data/expr`,
    # and §11 disputes a title through the same ladder as a table cell, so an
    # open account's `field` reaches `red_paths` with no `data/` prefix at
    # all. `scope`, `departments` and `branches` are three entries rather than
    # one compound label, so `scope/departments` composes as «دامنه ›
    # دپارتمان‌ها» through the same join every other nested path uses.
    "id": "شناسه", "aliases": "نام‌های دیگر", "statement": "بیان",
    "scope": "دامنه", "departments": "دپارتمان‌ها", "branches": "شعبه‌ها",
    "source": "منابع", "status": "وضعیت", "field_status": "وضعیت فیلدها",
    "accounts": "روایت‌ها", "speaker_role": "گوینده (نقش)",
    "issues": "نقص‌ها", "processes": "فرایندهای مرتبط",
    "updated_at": "آخرین تغییر",
}

#: The three names Appendix D labels twice, once per context — `(group, name)`,
#: where `group` is the path's second segment. Both readings are the
#: appendix's own; picking one and using it everywhere would be the paraphrase
#: QF-42 forbids.
_CONTEXT_LABELS: dict[tuple[str, str], str] = {
    ("outputs", "writes_to"): "نوشته می‌شود در",   # a measurement's is «ثبت در»
    ("rows", "when"): "فقط در",                    # a measurement's is «زمان»
    ("movement", "from"): "از",                    # an input's is «خوانده…»
}

#: Kind -> file, the plural of the kind name (spec §4, "Storage layout").
#:
#: **Four since 2026-09-16** («tables as the spine»): the owner removed the
#: `item` kind — *«Items, and any reference that was made to items, should be
#: removed»* — and `facts/items.json` with it. What an item used to be is a row
#: of a table.
_FILES: dict[str, str] = {
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
        return {"schema_version": 2, "entries": []}
    return storage.read_json(path)


def load_entry(root: Path, fact_id: str) -> dict | None:
    """The envelope `fact_id` names, or `None`.

    The index row's `kind` picks which of the four files to open; when the
    index and a store file disagree about an entry's kind, the file is the
    truth for content, so this uses the index only to find the file, never to
    answer anything about what is inside it. `None`, never an exception, both
    when the id is absent from the index and when the file the index row
    points at does not carry it — a caller (the confirm gate among them) can
    treat "not found" as one case rather than two. That same "never an
    exception" holds for a malformed row too — one missing `id` or naming a
    `kind` outside the four (a hand-edited or partially-migrated store) reads
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
    below is a walk over payloads (`inputs[].from`, `rows[]`, `accounts[]`). A
    file that is absent or unreadable contributes nothing rather than taking
    the request down with it.
    """
    # ponytail: no cache — one detail request re-reads the four files once per
    # bundle it asks for. Memoise per request (or per store mtime) if the store
    # grows past a few thousand entries; today it is four small JSON files.
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


def _red(entry: dict) -> tuple[list[str], list[str]]:
    """`(null paths, retired member prefixes)` — one walk, both answers.

    QF-6: a `null` leaf inside `data` is `unknown`; an absent key is not.
    QF-7's path grammar addresses dict fields and keyed array members only, so
    a `null` inside a member with no `key` has no path and is not counted — it
    cannot be disputed, resolved, or named in `field_status`.

    §9 takes one more set out: "Retired rows are omitted by `export`, excluded
    from the red rollup and QF-44's readiness test, and their `null` cells and
    open accounts leave the red set." A retired member's subtree is therefore
    not walked, and its path is collected instead so `red_paths` can drop the
    accounts that sit inside it.

    The engine's `merge_facts._red` answers exactly the same two lists; the
    two must agree, because the red count a reviewer sees here is the one
    `merge facts` derived `status` from — and `ui-backend/tests/
    test_facts_store.py` pins them against each other rather than trusting the
    prose.
    """
    nulls: list[str] = []
    retired: list[str] = []

    def walk(value, prefix):
        if value is None:
            nulls.append(prefix)
        elif isinstance(value, dict):
            for key, member in value.items():
                walk(member, f"{prefix}/{key}")
        elif isinstance(value, list):
            for member in value:
                if isinstance(member, dict) and "key" in member:
                    path = f"{prefix}/{member['key']}"
                    if member.get("retired"):
                        retired.append(path)
                        continue
                    walk({k: v for k, v in member.items() if k != "key"}, path)

    walk(entry.get("data") or {}, "data")
    return nulls, retired


def _null_paths(entry: dict) -> list[str]:
    """Every addressable `null` leaf under `data` — see `_red`."""
    return _red(entry)[0]


def red_paths(entry: dict) -> dict:
    """`{"unknown": [paths], "disputed": [paths]}` — the entry's red set.

    The two halves have different sources: `unknown` is every addressable
    `null` leaf, `disputed` every **open** account's field. A `chosen` or
    `rejected` account is settled and is not red (it still gets a
    `path_labels` label, because the accounts card shows the settled ones
    too). A retired row's cells are in neither (§9), which is `_red`'s subject.
    """
    nulls, retired = _red(entry)

    def withdrawn(field: str) -> bool:
        return any(field == prefix or field.startswith(prefix + "/")
                   for prefix in retired)

    return {
        "unknown": nulls,
        "disputed": sorted({a["field"] for a in entry.get("accounts") or []
                            if isinstance(a, dict) and a.get("status") == "open"
                            and isinstance(a.get("field"), str)
                            and not withdrawn(a["field"])}),
    }


def _labels(root: Path) -> dict[str, dict]:
    """`id -> {kind, title, retired?, fields?}`.

    **One namespace since 2026-09-16.** An item's *key* used to be a second way
    into this map, because a `refItems` cell held the key rather than a `{ref}`
    (QF-37's one exception). The item kind is gone and such a column is text,
    so an id is the whole of what a neighbour is named by.

    A **record** carries its columns too — `{field key: title}` — because a
    `{ref, field}` edge names one of them and the panel could otherwise only
    say which record a bound input reads, never which column. The title falls
    back to the key: a column with no Persian is still the column that edge
    names, and «record — key» answers the owner's question where «record»
    alone does not. Masking is unaffected — a restricted neighbour's whole
    label is replaced by the router, columns with it.

    `retired` rides along, present only when it is `True`: an entry's `home`
    reaches the screen through this map like any other reference, and a home
    that names a retired table is drawn as «جدول بازنشسته» rather than as a
    press into a table nobody fills in any more.
    """
    out: dict[str, dict] = {}
    for entry in load_all(root):
        if not isinstance(entry.get("id"), str):
            continue
        label = {"kind": entry.get("kind"), "title": entry.get("title")}
        if entry.get("retired") is True:
            label["retired"] = True
        if entry.get("kind") == "record":
            fields = {f["key"]: f.get("title") or f["key"]
                      for f in (entry.get("data") or {}).get("fields") or []
                      if isinstance(f, dict) and isinstance(f.get("key"), str)}
            if fields:
                label["fields"] = fields
        out[entry["id"]] = label
    return out


def _process_doc(root: Path, process_id: str) -> dict | None:
    """A process file read live from `departments/**` (QF-8 §2), or `None`.

    Live, and not from anything cached in the fact entry: the whole point of
    the link is to notice that the process has since been tombstoned.
    """
    if not _PROC_ID_RE.fullmatch(process_id or ""):
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
            and _PROC_ID_RE.fullmatch(p["ref"])]


def _cited_nodes(entry: dict) -> dict[str, set]:
    """`{process id: {node ids}}` — the nodes the entry's `process` sources
    cite (QF-8: a process link is a claim, and the node is its evidence).

    The process id comes from the source's file path, the way the engine's
    audit reads it, because that is the only place the source names a
    process.
    """
    out: dict[str, set] = {}
    for source in entry.get("source") or []:
        if not isinstance(source, dict) or source.get("type") != "process":
            continue
        node, ref = source.get("node"), source.get("ref")
        if not node or not isinstance(ref, str):
            continue
        process_id = PurePosixPath(ref).stem
        if _PROC_ID_RE.fullmatch(process_id):
            out.setdefault(process_id, set()).add(node)
    return out


def resolved_map(root: Path, entry: dict) -> dict:
    """Every id and process id the entry points at → `{kind, title, retired?,
    fields?}` (spec §17).

    The walk is over the **whole envelope**, not only `data`: `supersedes`,
    `superseded_by` and `issues[].affects` are `{ref}` objects too, and the
    detail screen renders their titles beside the payload's. A target that is
    gone is absent from the map — see the module docstring.
    """
    labels = _labels(root)
    found = {}
    for obj in iter_ref_objects(entry):
        ref = obj.get("ref")
        if isinstance(ref, str) and _FACT_ID_RE.fullmatch(ref) and ref in labels:
            found[ref] = labels[ref]
    for ref in _process_refs(entry):
        doc = _process_doc(root, ref)
        if doc is not None and doc.get("name"):
            found[ref] = {"kind": "process", "title": doc["name"]}
    return found


def row_titles(root: Path, entry: dict) -> dict:
    """`row key -> the row's Persian title` (spec §17).

    A row's own `title`, falling back to its key. Every row key is in the map,
    so a caller can render `row_titles[key]` unconditionally.

    **Nothing is composed any more.** A reference table's row used to have no
    title of its own — the row *was* its cells, so the title was built out of
    the titles of the items its `refItems` columns named, `prod_61__ing_41` →
    «اینجا پیتزا — قارچ» (§9). With the item kind gone (2026-09-16) such a
    column is text, so the only Persian a row has is its own, and the router no
    longer has a neighbour's name to withhold from a composed one.

    `root` stays in the signature: the caller is the bundle builder, which
    passes the store root to every map it assembles, and a reader of this
    module's one-argument-out exception would have to go and find out why.
    """
    rows = [r for r in (entry.get("data") or {}).get("rows") or []
            if isinstance(r, dict) and isinstance(r.get("key"), str)]
    return {r["key"]: r["title"] if isinstance(r.get("title"), str) and r["title"]
            else r["key"] for r in rows}


def binding_labels(root: Path, entry: dict) -> dict:
    """Where a binding or an instance actually sits — `{key: {workbook, sheet,
    branch}}`.

    A record carries its own `instances[]`, so its keys are answered from the
    entry itself. A rule carries only `applies_to[].record`, and the sheet and
    the branch live on the record it points at — so a rule's keys are answered
    by loading those records once and matching the binding key's instance
    prefix, which is how the key is built (`<instance key>__<column>__r<row>`).

    Serving it is the only way the card can draw the designed row: the client
    has no second entry and no manifest. A key whose instance cannot be
    resolved is absent from the map rather than half-named — the card draws the
    record's own title in that case, which is a true statement about where the
    rule runs.
    """
    titles = manifest.workbook_titles(root)
    names = {b.get("code"): b.get("name") for b in manifest.branches(root)}

    def label(inst: dict) -> dict:
        return {"workbook": titles.get(inst.get("spreadsheetId"), ""),
                "sheet": inst.get("sheet") or "",
                "branch": names.get(inst.get("branch"))}

    data = entry.get("data") or {}
    out = {i["key"]: label(i) for i in data.get("instances") or []
           if isinstance(i, dict) and i.get("key")}
    binds = [a for a in data.get("applies_to") or []
             if isinstance(a, dict) and a.get("key")]
    if not binds:
        return out
    # One walk of the store, not one per binding: a report rule binds ten
    # instances of two records and the store is five small files.
    instances = {}
    for other in load_all(root):
        for inst in (other.get("data") or {}).get("instances") or []:
            if isinstance(inst, dict) and inst.get("key"):
                instances[inst["key"]] = inst
    for bind in binds:
        prefix = "__".join(bind["key"].split("__")[:2])
        inst = instances.get(prefix)
        if inst is not None:
            out[bind["key"]] = label(inst)
    return out


def unit_titles(root: Path) -> dict[str, str]:
    """`{symbol: Persian title}` — the open rows of the `units` record, the
    one place the store names a unit in Persian.

    Served beside the entry and never inside it: `entry` is what QF-24
    fingerprints, and `ruleOutput` admits no `unit_title` anyway. The screen
    draws the title where a row names one and the bare symbol as an island
    where none does, so an undeclared symbol is absent rather than half-named.
    """
    for entry in load_all(root):
        if (entry.get("kind") == "record" and entry.get("key") == "units"
                and entry.get("retired") is not True):
            rows = (entry.get("data") or {}).get("rows") or []
            return {r["symbol"]: r["unit_title"] for r in rows
                    if isinstance(r, dict) and r.get("retired") is not True
                    and isinstance(r.get("symbol"), str)
                    and isinstance(r.get("unit_title"), str) and r["unit_title"]}
    return {}


def _member_title(data: dict, group: str, key: str) -> str | None:
    """The Persian `title` of the keyed member `data[group][key]`, if any.

    One helper for both readings of a path segment that names a keyed member:
    a declared column (`_field_title`) and any other keyed list a path walks
    through (`sections`, and whatever a later kind adds).
    """
    for member in data.get(group) or []:
        if isinstance(member, dict) and member.get("key") == key:
            title = member.get("title")
            if isinstance(title, str) and title:
                return title
    return None


def _field_title(entry: dict, key: str) -> str:
    """A column's, input's or output's Persian title — the entry's own word
    for it (QF-42), falling back to Appendix D and then to the key."""
    data = entry.get("data") or {}
    for group in _KEYED_GROUPS:
        title = _member_title(data, group, key)
        if title:
            return title
    return _LEAF_LABELS.get(key, key)


def _segment_label(data: dict, seg: list[str], i: int) -> str:
    """Segment `i` of a QF-7 path in Persian: the keyed member's own title
    where the segment names one, else Appendix D's label for the name (in the
    context of the group it sits in), else the segment as written."""
    member = _member_title(data, seg[i - 1], seg[i]) if i >= 2 else None
    return (member or _CONTEXT_LABELS.get((seg[1], seg[i]))
            or _LEAF_LABELS.get(seg[i], seg[i]))


def _path_label(entry: dict, path: str, titles: dict) -> str:
    """One QF-7 path → what a reviewer reads instead of it.

    No path falls through as itself, envelope paths included. The last branch
    is the general case for a payload path: `data/location/path`, `data/pack/size`,
    `data/movement/reason` and every other payload shape outside the keyed
    groups are composed segment by segment («محل › مسیر»), because a path
    printed raw on a Persian-only screen is exactly what §17 forbids.
    """
    seg = path.split("/")
    data = entry.get("data") or {}
    if seg[0] != "data" or len(seg) < 2:
        # An envelope path: `title`, `scope/departments`, `valid_to`. Not a
        # hypothetical — §11's write ladder disputes a scalar by materialising
        # the incumbent as an account, so a contested title is an open account
        # whose `field` is the bare string `title`, and `red_paths` carries it
        # with no prefix filter. Appendix D's envelope table labels every one.
        return " › ".join(_LEAF_LABELS.get(name, name) for name in seg)
    if seg[1] == "rows" and len(seg) >= 4:
        # «ستون — ردیف» (Appendix D): the reference-table cell, which is the
        # shape the red cards and the accounts card are built around. The leaf
        # is a declared column — except for the names a row object reserves
        # for its own structure (`when`, `section`, `open`, …), which no
        # `fields[].key` may take (§7's reservation, enforced by `validate`)
        # and which Appendix D labels in the row's context: a row's `when` is
        # «فقط در», a measurement's is «زمان». Hence the context lookup first;
        # it cannot shadow a column, because no column can be named that.
        leaf = _CONTEXT_LABELS.get(("rows", seg[3])) or _field_title(entry, seg[3])
        return f"{leaf} — {titles.get(seg[2], seg[2])}"
    if len(seg) >= 3 and seg[1] in _KEYED_GROUPS:
        column = _field_title(entry, seg[2])
        return (column if len(seg) == 3
                else f"{column} › {_segment_label(data, seg, len(seg) - 1)}")
    return " › ".join(_segment_label(data, seg, i) for i in range(1, len(seg)))


def path_labels(root: Path, entry: dict) -> dict:
    """Every red path, `field_status` line, account field and reconciled cell
    → a Persian label.

    Exactly those four sources, and not every path in the entry: these are the
    paths a screen names out loud — the red cards, the استنباطی/عرفی markers
    (§14.8, which the design computed and never rendered), the accounts card
    grouped by disputed field (§14.4), and the reconciliation row. A marker
    drawn beside a path with no label is the raw-key fallback §17 forbids,
    which is why `field_status` is here and not only in the red set: its lines
    are `inferred`/`informal`, never red, so `red_paths` does not carry them.
    """
    data = entry.get("data") or {}
    red = red_paths(entry)
    paths = set(red["unknown"]) | set(red["disputed"])
    paths |= {p for p in entry.get("field_status") or {} if isinstance(p, str)}
    paths |= {a["field"] for a in entry.get("accounts") or []
              if isinstance(a, dict) and isinstance(a.get("field"), str)}
    for pair in data.get("reconciled_against") or []:
        cell = pair.get("cell") if isinstance(pair, dict) else None
        if isinstance(cell, dict) and cell.get("row") and cell.get("field"):
            paths.add(f"data/rows/{cell['row']}/{cell['field']}")
    titles = row_titles(root, entry)
    return {p: _path_label(entry, p, titles) for p in sorted(paths)}


def _consumes(data: dict, fact_id: str) -> bool:
    """Does this payload use the target?

    QF-8 enumerates the typed edges itself — `inputs[].from`, `writes_to`,
    `of`, `via`, `calls[]`, `mirror_of`, `template_of`, `derived`,
    `reconciled_against`, `supersedes` — and every one of them but
    `supersedes` is a *use*, so every one of them but `supersedes` is here.
    The `refItems` cell was an eleventh until 2026-09-16, an edge carried as a
    bare key rather than a `{ref}`; the item kind it pointed at is gone.

    **`home` is deliberately not one of them.** It says where an entry lives,
    not that it reads anything the table holds — and a table's page already
    lists what is homed on it (`subsets`), which is the question `home`
    answers. Counting it here would make every rule of a table a "consumer" of
    it and drown the one list that answers "what breaks if this changes".

    Two deliberate exclusions. `supersedes`/`superseded_by` link two versions
    of one thing rather than one entry consuming another, and `processes[]`
    is the other id namespace and is already served by `process_links`.
    Everything else stays in, because this list answers "what breaks if this
    changes" — retire a template rule whose `template_of` instances are not
    counted and the answer comes back "nothing depends on this" while
    something does.
    """
    def hits(obj) -> bool:
        return isinstance(obj, dict) and obj.get("ref") == fact_id

    for member in data.get("inputs") or []:                    # from, via
        if isinstance(member, dict) and (hits(member.get("from"))
                                         or hits(member.get("via"))):
            return True
    if any(hits(c) for c in data.get("calls") or []):          # calls[]
        return True
    if hits(data.get("writes_to")) or hits(data.get("of")):    # a measurement's
        return True                                            # writes_to / of
    for member in data.get("outputs") or []:                   # a rule output's
        if isinstance(member, dict) and (hits(member.get("writes_to"))
                                         or hits(member.get("of"))):
            return True
    if hits(data.get("mirror_of")) or hits(data.get("template_of")):
        return True
    for member in data.get("fields") or []:                    # derived
        if isinstance(member, dict) and hits(member.get("derived")):
            return True
    for pair in data.get("reconciled_against") or []:          # reconciled
        if isinstance(pair, dict) and hits(pair.get("against")):
            return True
    return False


def consumers(root: Path, fact_id: str) -> list:
    """`[{"id", "title"}]` — the entries that use this one (QF-39's reverse
    index, derived server-side).

    Ordered by id, so two calls over one store answer in the same order.
    """
    return sorted(({"id": e["id"], "title": e.get("title")}
                   for e in load_all(root)
                   if isinstance(e.get("id"), str)
                   and _consumes(e.get("data") or {}, fact_id)),
                  key=lambda row: row["id"])


#: The kinds that can be homed on a table. A record never is: a table has no
#: home (§7, 2026-09-16).
_HOMED_KINDS = ("rule", "measurement", "note")


def _home_field(entry: object) -> str | None:
    """The column a stored `home` narrows to, or `None`.

    The **entry's**, because `.index.json` carries only the record id — the
    column is not indexed (spec 2026-09-16), and it is the entry that is the
    truth about its own payload anyway.
    """
    home = entry.get("home") if isinstance(entry, dict) else None
    field = home.get("field") if isinstance(home, dict) else None
    return field if isinstance(field, str) else None


def _about(entry: object) -> set:
    """The ids a note's `data.about` names."""
    data = (entry.get("data") or {}) if isinstance(entry, dict) else {}
    return {a["ref"] for a in data.get("about") or []
            if isinstance(a, dict) and isinstance(a.get("ref"), str)}


def subsets(root: Path, fact_id: str) -> list:
    """`[{"id", "kind", "title", "field"?}]` — what lives in this table.

    **The owner's ruling of 2026-09-16 («tables as the spine»)**: a table is
    the spine of the store, so its page lists every rule, measurement and note
    whose `home` is this record — and the notes *about* it that no table
    claims, because a note explaining a table is part of that table's page
    whether or not anyone placed it there.

    Derived here rather than in the client, and from the **index**, which is
    what `.index.json` is for: the flattened projection the store is listed
    through. The client holds one entry and could join nothing. Ordered by id,
    so two calls over one store answer in the same order — the rule `consumers`
    follows, and for the same reason.

    The entries are read too, for the two things the index does not carry: a
    `home`'s column, and a note's `about`. A row with no entry behind it is
    dropped, exactly as `list_facts` drops one: a row whose own page would 404
    is a dead link drawn by the server itself.

    Nothing here is a confirmation and nothing here is a mask — both are the
    router's (it holds the connection and the caller), and this module answers
    the same list to everyone.
    """
    entries = {e["id"]: e for e in load_all(root) if isinstance(e.get("id"), str)}
    index = load_index(root)
    rows = (index.get("entries") if isinstance(index, dict) else None) or []
    out = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        rid, kind = row.get("id"), row.get("kind")
        if not isinstance(rid, str) or rid == fact_id or kind not in _HOMED_KINDS:
            continue
        entry = entries.get(rid)
        if entry is None:
            continue
        home = row.get("home")
        if home != fact_id and not (
                kind == "note" and not home and fact_id in _about(entry)):
            continue
        member = {"id": rid, "kind": kind, "title": row.get("title")}
        field = _home_field(entry)
        if field is not None:
            member["field"] = field
        out.append(member)
    return sorted(out, key=lambda r: r["id"])


def process_links(root: Path, entry: dict) -> list:
    """`[{"ref", "title", "tombstoned", "heir", "missing_nodes"}]` — the
    entry's process links, resolved against `departments/**` as it is now
    (QF-8 §2).

    A tombstoned process carries its heir, so the screen can offer the
    re-point the audit proposes; a link whose file is gone answers with a
    `None` title, which is what "the process this cites is no longer there"
    looks like to a reader.

    `missing_nodes` is §14.7's «گرهٔ ارجاع‌شده حذف شده» orphan class, and this
    is its only server-side source: `validate` checks a cited node exists when
    the link is *written*, so a node a later restructure removed is invisible
    to everything downstream unless it is recomputed against the live file —
    which this walk is already reading.
    """
    cited = _cited_nodes(entry)
    out = []
    for ref in _process_refs(entry):
        doc = _process_doc(root, ref) or {}
        live = {n.get("id") for n in doc.get("nodes") or []
                if isinstance(n, dict) and not n.get("removed")}
        out.append({"ref": ref, "title": doc.get("name"),
                    "tombstoned": bool(doc.get("tombstoned")),
                    "heir": _heir(doc) if doc.get("tombstoned") else None,
                    "missing_nodes": sorted(cited.get(ref, set()) - live)})
    return out


def coverage(root: Path) -> dict:
    """`{"read": n, "total": m}` — how much of the estate has been read.

    The panel's own count: `merge facts check` withdrew its workbook
    denominator in v3, so nothing upstream reports this and the join is made
    here. A workbook is *read* when a **non-stub** `record` names its
    `spreadsheetId` in `data.location`. A stub is identity and nothing else
    (QF-20), so it reads nothing; a retired record still counts, because the
    reading did happen and the tab going away does not un-read the workbook.
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
