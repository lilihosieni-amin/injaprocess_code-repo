"""`merge facts resolve|retire|promote|edit|export|repair-source-refs` — the verbs
that mutate an already-applied entry by hand rather than by re-reading a source
(spec §12, rows 2-5). `apply` is the only verb that reads a delta; these read a
decision an operator (or a downstream tool) already made.

The one `repair-*` verb takes no entry id, and it exists for one reason: §11's
ladder can only create, fill, dispute, append and union. It cannot rewrite a
value in place (`repair-source-refs` — a corrected `ref` is a different member
of a union field, so a delta would add a second citation beside the broken
one). QF-2 leaves `merge facts` the only thing allowed to write `facts/**` at
all, so what a delta cannot express has to be a verb or nothing. Its own
docstring carries the bug it was written for and why `revert` could not serve
instead.

`edit` (v3.7 §2) is the same argument taken one step further: the ladder
cannot rewrite ANY value in place, so the owner asking the bot to change a
word in ten statements changed nothing at all. It applies a patch of
set/remove/unset/append ops to one entry, gated by the store's own gate.

Every *writing* verb (`resolve`, `retire`, `promote`, `edit` and
`repair-source-refs`) shares one shape:
`load_store`, find the entry, mutate it, `entry["status"] = derive_status
(entry)`, stamp `updated_at` on the touched entry only, snapshot the five
files to `{run_dir}/facts-before/` (`apply`'s own `_snapshot`, Task 5 — taken
right before the write, same as `apply`'s), `save_store` (which rebuilds
`.index.json`), and append `{"verb": ..., "args": {...}}` to
`{run_dir}/facts-delta.json` — a run directory each call gets to itself
(never `apply`'s own run dir, whose `facts-delta.json` is the applied delta
verbatim, not a list). The snapshot is what lets `revert` (Task 7) undo one of
these calls the same way it undoes an `apply`. `export` is read-only and
takes no run directory.

`retire`'s default `valid_to` is "today" in the Jalali calendar, Latin
digits — QF-41's stored business-date type, the same convention
`upload_bot.naming.normalize_date` writes. `engine/pyproject.toml` declares
`jdatetime` (a coordinator ruling on task 6: this is core engine behaviour, a
standalone `pip install -e engine` must compute it without upload-bot alongside
it). The date itself is `apply._today_jalali`, imported here rather than
restated: `apply` writes the same date into a superseded entry's `valid_to`
(v3 §4), and two definitions of "today" is one too many. `--date`
stays as an explicit override for a caller that needs a specific date on the
record rather than the day the verb ran.
"""
import copy
import csv
import json
import pathlib
import sys
from datetime import datetime, timezone

from engine_common import read_json, under, validate, write_json_atomic
from merge_facts import (
    KIND_FILES,
    KIND_ORDER,
    append_path,
    derive_status,
    get_path,
    is_open,
    iter_ref_objects,
    ledger,
    load_store,
    path_exists,
    remove_path,
    save_store,
    set_path,
    unset_path,
)
from merge_facts import conventions
# `_snapshot` is `apply`'s own (Task 5): the five files as they stand right
# before a write, kept at `{run_dir}/facts-before/` so `revert` (Task 7) can
# restore an entry wholesale. Every *writing* verb here needs the same
# snapshot for the same reason — its run directory is just as revertible as
# an `apply` run's, and the controller ruling for `revert` treats a verbs
# run's `args["id"]` targets as ordinary matched entries, which only works if
# there is something to restore them from.
from merge_facts.apply import (KEY_RE, _recompute_location, _run_ref, _snapshot,
                               _today_jalali)
from merge_facts.audit import _manifest
from merge_facts.content import check_document
# `edit` settles a dispute the way the ladder raised one: the same numeric
# equality (`_equal`), the same account id (`with_account_id`), the same dedup
# key for the chat citation it unions in (`UNION_FIELDS["source"]`) and the
# same answer to "what makes two members of this collection the same one"
# (`keyfn_for`). A second opinion on any of the four is a second store.
from merge_facts.ladder import UNION_FIELDS, _equal, keyfn_for, with_account_id
from merge_facts.preconditions import (FACT_ID_RE, _unit_row_keys,
                                       registered_scope,
                                       undeclared_unit_problems,
                                       unregistered_scope_problems)

_KIND_DATA_STUBS = {
    # Neutral containers `promote` may inject — empty, so nothing is
    # fabricated: `rule`'s `inputs`/`outputs` start as empty lists (a later
    # apply or edit fills them), and `note`'s own `data` needs nothing extra.
    # item/record/measurement are deliberately absent: their schema-required
    # keys (`_KIND_REQUIRED_KEYS` below) are facts about the world — category,
    # unit, medium, role, location, quantity — and `promote` must never guess
    # at one. A note promoted to one of those three kinds is only accepted
    # when its own `data` already carries them.
    "rule": {"inputs": [], "outputs": []},
    "note": {},
}

_KIND_REQUIRED_KEYS = {
    "item": ("category", "unit"),
    "record": ("medium", "role", "location"),
    "measurement": ("quantity", "unit"),
}


def _refuse(problems):
    """Exit 2 with every reason on stderr — and nothing written (ARD §7)."""
    for msg in problems:
        print(f"precondition failed: {msg}", file=sys.stderr)
    raise SystemExit(2)


def _fail(msg):
    _refuse([msg])


def _find(store, fact_id):
    for kind in KIND_ORDER:
        for e in store[kind]["entries"]:
            if e["id"] == fact_id:
                return kind, e
    return None, None


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _append_delta(run_dir, verb, args):
    """`{run_dir}/facts-delta.json` as a growing JSON list of what ran here —
    never the apply-shaped delta object `apply` itself keeps, because these
    verbs are always handed a run directory of their own."""
    path = pathlib.Path(run_dir) / "facts-delta.json"
    doc = read_json(path) if path.exists() else []
    doc.append({"verb": verb, "args": args})
    write_json_atomic(path, doc)


def _record_chat(root, run_dir, entry):
    """The chat confirmation for the one entry this verb wrote — only when the
    run says `origin: chat` (v3.7 §3.3). `edit` is the exception and records
    always; it calls `ledger.record` itself."""
    run_dir = pathlib.Path(run_dir)
    ledger.record(root, run_dir, _run_ref(pathlib.Path(root), run_dir), [entry])


def _clear_unit_ref(entry, field):
    """§4: resolving a `unit` leaf drops the `unit_ref` written beside it. The
    pair is written together, so a settled symbol left sitting next to the ref
    of the reading that lost is worse than no ref.

    v3 §3.3 closed every payload (`additionalProperties: false`), and
    `unit_ref` is declared in none of them — the estate's 137 of them are the
    cooking run's invented key. So this pop is also what lets an entry still
    carrying one be saved at all, and there is no "unless the chosen account
    names one itself" case to spare: every `unit` leaf in the schema is typed
    `string | null` (facts.schema.json:67, 122, 143, 172, 185, 204, 217, 269),
    so a `{ref}` installed at one fails `save_store` whatever this does.
    """
    if field.rsplit("/", 1)[-1] != "unit" or "/" not in field:
        return
    holder = get_path(entry, field.rsplit("/", 1)[0])
    if isinstance(holder, dict):
        holder.pop("unit_ref", None)


def resolve(root, fact_id, field, account_id, run_dir):
    """Settle one disputed field: `account_id` is `chosen`, every other
    account on the SAME `field` is `rejected`, and its value is written into
    the disputed path — the only place a resolved value is ever installed
    outside the write ladder."""
    root = pathlib.Path(root)
    store = load_store(root)
    _, entry = _find(store, fact_id)
    if entry is None:
        _fail(f"entry {fact_id} not found")
    accounts = entry.get("accounts") or []
    chosen = next((a for a in accounts if a["id"] == account_id), None)
    if chosen is None:
        _fail(f"account {account_id} not found on {fact_id}")
    if chosen.get("field") != field:
        _fail(f"account {account_id} is on field {chosen.get('field')!r}, "
              f"not {field!r}")
    chosen["status"] = "chosen"
    for a in accounts:
        if a is not chosen and a.get("field") == field:
            a["status"] = "rejected"
    set_path(entry, field, chosen.get("value"))
    _clear_unit_ref(entry, field)
    entry["status"] = derive_status(entry)
    entry["updated_at"] = _now()
    _snapshot(root, pathlib.Path(run_dir))
    save_store(root, store)
    _record_chat(root, run_dir, entry)
    _append_delta(run_dir, "resolve",
                  {"id": fact_id, "field": field, "account": account_id})


def retire(root, fact_id, heir, run_dir, date=None):
    """`retired: true`, `valid_to` set (today's Jalali date unless `date` is
    given), and `superseded_by` pointed at `heir` when there is one. A
    retired heir is refused outright — retiring into a dead end would let the
    chain of `superseded_by` refs go nowhere."""
    root = pathlib.Path(root)
    store = load_store(root)
    _, entry = _find(store, fact_id)
    if entry is None:
        _fail(f"entry {fact_id} not found")
    if heir is not None:
        _, heir_entry = _find(store, heir)
        if heir_entry is None:
            _fail(f"heir {heir} not found")
        if heir_entry.get("retired"):
            _fail(f"heir {heir} is itself retired")
    entry["retired"] = True
    entry["valid_to"] = date or _today_jalali()
    if heir is not None:
        entry["superseded_by"] = {"ref": heir}
    entry["status"] = derive_status(entry)
    entry["updated_at"] = _now()
    _snapshot(root, pathlib.Path(run_dir))
    save_store(root, store)
    _record_chat(root, run_dir, entry)
    _append_delta(run_dir, "retire",
                  {"id": fact_id, "heir": heir, "date": entry["valid_to"]})


def promote(root, fact_id, kind, key, run_dir):
    """Move a note into a real kind, in place: the id stays, the kind and key
    change. `data` gets only neutral, empty containers a promote may add
    without inventing a fact (see `_KIND_DATA_STUBS`) — for item/record/
    measurement, the note's own `data` must already carry the target kind's
    schema-required keys, or promotion is refused. Only a note is promotable,
    and its hash key never carries over — `key` is always required."""
    root = pathlib.Path(root)
    store = load_store(root)
    src_kind, entry = _find(store, fact_id)
    if entry is None:
        _fail(f"entry {fact_id} not found")
    if src_kind != "note":
        _fail(f"{fact_id} is a {src_kind}, not a note — only notes are promotable")
    if kind not in KIND_FILES:
        _fail(f"kind {kind!r} is not a recognised kind")
    if not key or not KEY_RE.fullmatch(key):
        _fail(f"key {key!r} is not a minted key")
    if any(e["key"] == key and is_open(e) for e in store[kind]["entries"]):
        _fail(f"key {key!r} is already used by an open entry of kind {kind!r}")
    required = _KIND_REQUIRED_KEYS.get(kind)
    if required is not None:
        data = entry.get("data") or {}
        missing = [k for k in required if k not in data]
        if missing:
            _fail(f"promoting to {kind} requires data keys {', '.join(missing)}")
    store["note"]["entries"].remove(entry)
    entry["kind"] = kind
    entry["key"] = key
    data = entry.setdefault("data", {})
    if kind != "note":                  # QF-9: the note's own payload is a
        for k in ("about", "question"): # pointer and a question, and neither
            data.pop(k, None)           # survives into ANOTHER kind's closed
                                        # payload. A note→note rekey stays a
                                        # note, so it keeps both — dropping them
                                        # would leave a payload `noteData`
                                        # requires and `save_store` refuses.
    for k, default in _KIND_DATA_STUBS.get(kind, {}).items():
        data.setdefault(k, copy.deepcopy(default) if isinstance(default, (list, dict))
                        else default)
    entry["status"] = derive_status(entry)
    entry["updated_at"] = _now()
    store[kind]["entries"].append(entry)
    # Belt: every precondition above is checked before this point, but a
    # residual schema failure (a shape `_KIND_REQUIRED_KEYS` doesn't cover)
    # must still exit clean rather than traceback. `save_store` validates
    # all five files before writing any, so the store is untouched either way.
    try:
        _snapshot(root, pathlib.Path(run_dir))
        save_store(root, store)
    except ValueError as e:
        _fail(str(e))
    _record_chat(root, run_dir, entry)
    _append_delta(run_dir, "promote", {"id": fact_id, "kind": kind, "key": key})


# --------------------------------------------------------------------------- #
# `edit` — v3.7 §2: the one verb that rewrites a value in place
# --------------------------------------------------------------------------- #

#: The top-level fields an op may never name, and why (§2.3 item 2).
_EDIT_IMMUTABLE = {"id": "identity", "kind": "identity (promote changes a note's kind)",
                   "key": "identity", "status": "derived", "updated_at": "derived"}

#: `retired` is half-immutable, so it is not in the table above: `edit` may
#: only take the flag OFF (spec §1's promise that a mistaken retire is
#: undoable). Setting it ON is `retire`'s job and nothing else's — the verb
#: dates the entry in Jalali, points it at an heir, and the playbook asks the
#: owner first. `valid_to`, `supersedes` and `superseded_by` stay editable:
#: they are the record of a retirement, not the act of one.
_EDIT_RETIRE_IS_THE_VERB = "retire is the verb"

#: How much of a value the preview prints before it elides the middle (§2.5).
_RENDER_LIMIT = 400


def _chat_source(run_ref):
    """The citation an edit leaves behind: the run that carried the owner's
    own instruction — the card's «گفتگو» row."""
    return {"type": "chat", "ref": f"{run_ref}/meta.json", "run": run_ref}


def _render(value, limit=_RENDER_LIMIT):
    """A value as the store holds it: the bare string for a string, JSON for
    everything else (Latin digits for a number); elided in the middle past
    `limit` characters (§2.5)."""
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    if len(text) > limit:
        text = text[:limit // 2] + "…" + text[-(limit // 2):]
    return text


def _apply_op(entry, op):
    """One op on `entry`; returns `(before, after)` for the preview. Raises
    KeyError for a path that names nothing, TypeError/ValueError with the
    refusal's own wording for an op the entry will not take."""
    path, verb = op["path"], op["op"]
    head = path.split("/", 1)[0]
    if head in _EDIT_IMMUTABLE:
        raise ValueError(f"{path!r} is {_EDIT_IMMUTABLE[head]} and is never edited")
    if head == "source":
        raise ValueError("source[] is provenance and is never edited "
                         "(repair-source-refs is the one writer of a citation)")
    if head == "retired" and not (verb == "set" and op.get("value") is False):
        raise ValueError(_EDIT_RETIRE_IS_THE_VERB)
    before = get_path(entry, path) if path_exists(entry, path) else None
    if verb == "set":
        value = op["value"]
        if isinstance(before, dict) and "key" in before \
                and isinstance(value, dict) and value.get("key") != before["key"]:
            raise ValueError(f"{path!r}: a member replaced by set keeps its key")
        set_path(entry, path, value)          # creates a field, never a member
        return before, value
    if verb == "append":
        value = op["value"]
        members = before if isinstance(before, list) else []   # else: append_path refuses
        keyfn = keyfn_for(path.rsplit("/", 1)[-1])
        if isinstance(value, dict) and any(
                isinstance(m, dict) and keyfn(m) == keyfn(value) for m in members):
            raise ValueError(f"{path!r}: a member with that key is already there "
                             f"— set it")
        append_path(entry, path, value)
        return None, value              # the preview shows what joins, not the list
    if not path_exists(entry, path):          # remove / unset: nothing to undo
        raise KeyError(path)
    (remove_path if verb == "remove" else unset_path)(entry, path)
    return before, None


def _settle(entry, path, value, chat_src):
    """A `set` on a disputed path settles it (§2.4), the way `resolve` does:
    the account holding the value the edit installs is `chosen` — a new chat
    account when none holds it — and every OTHER account on that path is
    `rejected`, whatever it said before. A `remove`/`unset` (`value` None)
    rejects them all and appends nothing: the question is gone, not answered.
    """
    accounts = entry.get("accounts") or []
    on_path = [a for a in accounts if a.get("field") == path]
    if not any(a.get("status") == "open" for a in on_path):
        return                                # no dispute here to settle
    match = next((a for a in on_path if _equal(a.get("value"), value)), None)
    for a in on_path:
        a["status"] = "rejected"
    if match is not None:
        match["status"] = "chosen"
    elif value is not None:
        accounts.append(with_account_id(
            {"field": path, "statement": _render(value), "value": value,
             "source": {k: v for k, v in chat_src.items() if k != "run"},
             "speaker_role": None, "status": "chosen"}))
    _clear_unit_ref(entry, path)


def _gate(root, store, kind, entry):
    """The store gate every run passes, on this one entry (§2.3 item 4): the
    `save_store` schema pass, the content pass `validate facts` runs, QF-33's
    registered scope, QF-40's declared unit symbols and QF-37's resolvable
    `{ref}`s. Nothing less — an entry a chat instruction rewrote is written to
    the same five files as one a delta wrote, and there is no second, softer
    contract for it. (The rules `preconditions` runs that are about a delta
    rather than an entry — a creation's department, QF-34's title twin, one
    open record per tab — belong to `apply` and are not re-run here.)"""
    problems = []
    try:
        validate("facts.schema.json", store[kind])
    except ValueError as exc:
        problems.append(str(exc))
    unit_rows = _unit_row_keys(store, [])
    doc = {"schema_version": store[kind]["schema_version"], "entries": [entry]}
    problems += check_document(doc, "facts", store=store, unit_symbols=unit_rows,
                               conventions=conventions.load(root))
    problems += undeclared_unit_problems(entry, unit_rows, entry["id"])
    problems += unregistered_scope_problems(entry, *registered_scope(root),
                                            entry["id"])
    for obj in iter_ref_objects(entry.get("data") or {}):
        ref = obj.get("ref")
        if isinstance(ref, str) and FACT_ID_RE.fullmatch(ref) \
                and _find(store, ref)[1] is None:
            problems.append(f"{entry['id']}: ref {ref} names no entry")
    return problems


def edit(root, fact_id, patch_path, run_dir, preview=False):
    """v3.7 §2 — set/remove/unset/append on one entry: the ladder can create,
    fill, dispute, append and union, and none of those is "change this word".
    The ops run in order on a copy, any dispute they touch settles, the copy
    faces the store's own gate, and only then is anything written. `preview`
    prints the block of §2.5 and writes nothing at all.

    Returns `{"id", "ops": [{index, op, path, before, after}], "problems"}`.
    """
    root, run_dir = pathlib.Path(root), pathlib.Path(run_dir)
    # The chat source unioned in below cites `{run_dir}/meta.json`, and the
    # ledger reads the actor off it: without the file the citation dangles
    # (`merge facts check` reports it moved) and the vouch is anonymous.
    if not (run_dir / "meta.json").is_file():
        _fail("run directory carries no meta.json")
    patch = read_json(patch_path)
    try:
        validate("facts-patch.schema.json", patch)
    except ValueError as exc:
        _fail(str(exc))
    store = load_store(root)
    kind, entry = _find(store, fact_id)
    if entry is None:
        _fail(f"entry {fact_id} not found")
    run_ref = _run_ref(root, run_dir)
    chat_src = _chat_source(run_ref)
    work = copy.deepcopy(entry)
    ops, problems, entries = [], [], None
    for i, op in enumerate(patch["ops"], 1):
        try:
            before, after = _apply_op(work, op)
            ops.append({"index": i, "op": op["op"], "path": op["path"],
                        "before": before, "after": after})
            if op["op"] != "append":          # §2.4: a `set` settles a dispute
                _settle(work, op["path"],     # and a remove/unset rejects it;
                        op["value"] if op["op"] == "set" else None,  # an append
                        chat_src)             # answers no question at all
        except KeyError as exc:
            problems.append(f"op {i} {op['op']} {op['path']}: not found ({exc})")
            break
        # AttributeError joins the tuple for the same reason the shape check
        # below exists: a value of the wrong SHAPE reaches a step that trusts
        # the entry to be built as the schema says (here `_settle`'s walk over
        # `accounts`), and a wrong instruction is a refusal, never a traceback.
        except (AttributeError, TypeError, ValueError) as exc:
            problems.append(f"op {i} {op['op']} {op['path']}: {exc}")
            break
    if not problems:
        # The shape, before anything reads it. Every step below — the
        # `field_status` pruning, `_recompute_location`, the source union, the
        # gate's own scope and prose checks — walks `work` as the schema says
        # it is built, so `set scope "cooking"` or `set data "x"` used to
        # traceback out of one of them instead of being refused. One check at
        # the root covers all of them; the gate re-runs it on the whole file.
        try:
            validate("facts.schema.json", {**store[kind], "entries": [work]})
        except ValueError as exc:
            problems.append(f"the result fails facts.schema.json: {exc}")
    if not problems:
        field_status = {p: v for p, v in (work.get("field_status") or {}).items()
                        if path_exists(work, p)}
        if field_status:
            work["field_status"] = field_status
        else:
            work.pop("field_status", None)
        _recompute_location(work)
        sources = work.setdefault("source", [])
        source_key = UNION_FIELDS["source"]
        if source_key(chat_src) not in {source_key(s) for s in sources}:
            sources.append(chat_src)
        work["status"] = derive_status(work)
        work["updated_at"] = _now()
        entries = [work if e["id"] == fact_id else e
                   for e in store[kind]["entries"]]
        problems += _gate(root, {**store, kind: {**store[kind], "entries": entries}},
                          kind, work)
    report = {"id": fact_id, "ops": ops, "problems": problems}
    if preview:
        for o in ops:
            print(f"[{o['index']}] {o['op']} {o['path']}")
            if o["before"] is not None:
                print(f"    فعلی:    {_render(o['before'])}")
            if o["after"] is not None:
                print(f"    پیشنهاد: {_render(o['after'])}")
    if problems:
        _refuse(problems)
    if preview:
        print("OK")
        return report
    store[kind]["entries"] = entries
    _snapshot(root, run_dir)
    save_store(root, store)
    # Always, whatever `meta.json` says: the verb exists for chat instructions,
    # and I7 asks that one leave nothing for the UI to accept (v3.7 §3.3).
    ledger.record(root, run_dir, run_ref, [work], force=True)
    _append_delta(run_dir, "edit", {"id": fact_id,
                                    "patch": pathlib.Path(patch_path).name,
                                    "ops": len(ops)})
    return report


def _repaired_ref(root, manifest_by_id, ref):
    """The path QF-5 requires for a `ref` that names no file, or `None`.

    Two shapes, both read off what is actually on disk rather than guessed:

    * a bare Google Drive **spreadsheet id** — the manifest maps it to the
      workbook's directory and file, which is the whole reason the manifest
      carries `dir` and `file` beside `spreadsheetId`;
    * a path that **lost its root** — `Gozaresh markazi/Gozaresh markazi.gs`
      instead of `attachments/sheets/Gozaresh markazi/…`. Written as "does
      prefixing the estate root name a file that exists" rather than as a rule
      about `.gs`, because it is the same slip whatever the extension.

    Anything else answers `None` and is left exactly as it is. A repair that
    guessed would put a citation on an entry pointing at evidence nobody
    checked, which is worse than the broken one it replaced.
    """
    if (root / ref).exists():
        return None                                  # already a real path
    workbook = manifest_by_id.get(ref)
    if workbook and workbook.get("dir") and workbook.get("file"):
        return f"attachments/sheets/{workbook['dir']}/{workbook['file']}"
    rooted = f"attachments/sheets/{ref}"
    return rooted if (root / rooted).is_file() else None


def repair_source_refs(root, run_dir):
    """Rewrite every `source[].ref` that names no file into the path QF-5
    requires. Returns `[(id, rewritten)]`, entry order.

    **The bug this exists for.** QF-5 says a `ref` is a path relative to
    `data-repo/` and that an unresolvable one fails `apply` — but nothing
    implemented that until 2026-09-06, and `_hash_of` answers `null` for a file
    that is not there rather than complaining. So 575 citations were written
    holding a bare Drive spreadsheet id and 23 holding a path with its
    `attachments/sheets/` root missing, all hashed as nothing. They failed at
    the single place a ref is ever used: `GET /api/facts/source` resolves it
    against three roots, an id is inside none of them, and the reviewer gets
    «File wasn't available on site» — the owner's report.

    A verb for the reason above: §11's ladder cannot rewrite a
    value in place (a corrected `ref` is a different member of a union field,
    so a delta would ADD a second citation beside the broken one), and QF-2
    admits no other writer of `facts/**`.

    `hash` and `run` are deliberately left alone. The hash was `null` because
    the file could not be found, and re-hashing here would stamp this repair
    run as the reader of a file it never opened — `merge facts check` re-hashes
    every citation and is the thing that should fill them, on its own terms.
    """
    root = pathlib.Path(root)
    store = load_store(root)
    by_id = {w["spreadsheetId"]: w for w in _manifest(root).get("workbooks") or []
             if isinstance(w, dict) and w.get("spreadsheetId")}
    repaired, unrepairable = [], []
    for kind in KIND_ORDER:
        for entry in store[kind]["entries"]:
            done = 0
            sources = list(entry.get("source") or [])
            sources += [a.get("source") for a in entry.get("accounts") or []
                        if isinstance(a, dict)]
            for src in sources:
                if not isinstance(src, dict):
                    continue
                ref = src.get("ref")
                if not isinstance(ref, str) or not ref:
                    continue
                fixed = _repaired_ref(root, by_id, ref)
                if fixed is None:
                    if not (root / ref).exists():
                        unrepairable.append((entry["id"], ref))
                    continue
                src["ref"] = fixed
                done += 1
            if done:
                entry["updated_at"] = _now()
                repaired.append((entry["id"], done))
    if repaired:
        _snapshot(root, pathlib.Path(run_dir))
        save_store(root, store)
        for fid, n in repaired:
            _append_delta(run_dir, "repair-source-refs", {"id": fid, "rewritten": n})
    return repaired, unrepairable


def export(root, record_key, out, include_retired):
    """A reference or config record's rows as CSV: `key` plus its declared
    `fields[].key`, in declaration order. A retired row (`retired` is one of
    the reserved row-member names Task 9's content check validates) is
    skipped unless `include_retired`. `out` may not land under `facts/` or
    `runs/` — both are the store's own territory, not an export drop point."""
    root, out = pathlib.Path(root), pathlib.Path(out)
    store = load_store(root)
    entry = next((e for e in store["record"]["entries"]
                 if e["key"] == record_key and is_open(e)), None)
    if entry is None:
        _fail(f"no open record {record_key!r}")
    role = (entry.get("data") or {}).get("role")
    if role not in ("reference", "config"):
        _fail(f"record {record_key!r} has role {role!r}, not reference/config")
    if under(out, root / "facts") or under(out, root / "runs"):
        _fail(f"export path {out} must not be under facts/ or runs/")
    fields = [f["key"] for f in (entry.get("data") or {}).get("fields") or []
             if isinstance(f, dict) and f.get("key")]
    rows = (entry.get("data") or {}).get("rows") or []
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["key"] + fields)
        for row in rows:
            if not include_retired and row.get("retired"):
                continue
            writer.writerow([row.get("key")] + [row.get(k) for k in fields])
    return out
