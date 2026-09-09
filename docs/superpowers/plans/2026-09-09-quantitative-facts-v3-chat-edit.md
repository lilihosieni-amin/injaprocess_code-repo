# Quantitative Facts v3.7 — Chat Edits: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner's chat instruction changes the facts store in one round trip — `merge facts edit` rewrites, removes and appends what the ladder never could, the entry comes out confirmed as the chat actor's without a visit to the UI, and a decision table has one declared row shape.

**Architecture:** One new writing verb in `verbs.py`'s established shape (load, mutate, derive, snapshot, save, record), gated by the store schema plus `content.check_document` — the same gate every run passes. A small ledger file `facts/.confirmations.json` written by the engine on chat-origin runs and read by the ui-backend beside its own `app.db` marks. A ninth content check pins the table row shape, and the card teaches it. The `edit-fact` playbook writes mechanical patches itself and dispatches the agent only to compose prose.

**Tech Stack:** Python 3.11/3.12, pytest, JSON Schema draft 2020-12, FastAPI + sqlite (ui-backend), React/TypeScript/vitest (ui), the Persian prose rules of the v3 design.

**Spec:** `docs/superpowers/specs/2026-09-09-quantitative-facts-v3-chat-edit-design.md` (v3.7). §1's I7 and I8 are the acceptance criteria; §2–§6 are binding on the shapes below.

## Global Constraints

- Engine CLIs deterministic; `exit 2` with `precondition failed: …` on stderr and **nothing written** on refusal (ARD §7). INV-1, INV-4 unchanged: no id minted outside `allocate-id`, no hard delete.
- `facts/**` is written only by `merge facts` (QF-2); the ledger lives under `facts/` and is written by the engine (and removed from by the ui-backend's revoke, §3.4).
- Every path in a patch is a QF-7 path (`/`-separated; a list member by its `key`, an `accounts[]` member by its `id`).
- The store gate for an edited entry is exactly: `validate("facts.schema.json", store[kind])` + `check_document(store-doc-with-that-one-entry, "facts", store=store, unit_symbols=_unit_row_keys(store, []), conventions=load(root))` + every `F-` ref under the entry resolving in the store.
- Owner-facing text (preview labels «فعلی:»/«پیشنهاد:», the playbook's Persian) carries no id, path, command or English word; engine messages are English with the entry id as the label.
- Tests scoped: `.venv/bin/pytest -q -k "<expr>"` from the code worktree root; ui: `cd ui && ./node_modules/.bin/vitest run <path>`; hooks: `<code-worktree>/.venv/bin/pytest -q <data-worktree>/.claude/hooks`.
- Commits: one per task, named paths, never `git add -A`, footer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DPTHdFJLvB9Zr9hb1AySvY
  ```
  Never push. Workspaces: code worktree `.claude/worktrees/facts-v3-gate` (branch `facts-v3-gate`); data worktree `…/process dev/data-repo.facts-v3-gate` (branch `facts-v3-gate`, fast-forwarded to `main` in Task 5's first step). The live data-repo is never touched by Tasks 1–5.

## File structure

| file | responsibility | task |
|---|---|---|
| `engine/merge_facts/__init__.py` | `_step` learns `id`; `remove_path`, `unset_path`, `append_path` beside `set_path`; `save_store` prunes the ledger | T1, T2 |
| `engine/merge_facts/verbs.py` | `edit(root, fact_id, patch_path, run_dir, preview=False)` and its helpers; every writing verb records a chat confirmation | T1, T2 |
| `engine/merge_facts/ledger.py` (new) | `load`, `save`, `prune`, `record`, `forget_run` over `facts/.confirmations.json` | T2 |
| `engine/merge_facts/apply.py`, `revert.py` | chat-origin runs record/forget ledger rows | T2 |
| `engine/merge_facts/content.py` | `_check_table_shape` (I8) | T4 |
| `engine/merge/cli.py` | the `edit` sub-parser and dispatch | T1 |
| `engine/facts_plan/build.py` | `KIND_NOTE["rule"]` fourth shape; fourth `EXAMPLES` member | T4 |
| `schemas/facts-patch.schema.json` (new), `schemas/facts-confirmations.schema.json` (new), `schemas/facts.schema.json`, `schemas/facts-delta.schema.json`, `schemas/README.md` | contracts | T1, T2, T4 |
| `ui-backend/inja_ui_backend/store/chat_confirmations.py` (new), `routers/facts.py`, `routers/confirmations.py` | read the ledger beside `app.db`; revoke removes a ledger row | T3 |
| `ui/src/facts/cards/RuleCard.tsx`, `ui/src/api/types.ts`, `ui/src/facts/cards/RuleCard.test.tsx` | flat rows only | T4 |
| data-repo `.claude/skills/edit-fact/SKILL.md`, `.claude/agents/quantify.md`, `CLAUDE.md`, `.claude/hooks/test_guard.py`, `.claude/hooks/test_playbook_lint.py` | the playbook v2, the agent's patch form, pins | T5 |
| `docs/runbooks/07-facts.md` §13 (new) + §6, `docs/decisions/0017-facts-pipeline-v3.md` | operator docs | T2, T4 |

Order: T1 ∥ T4 ∥ T5 → T2 (after T1) ∥ T3 (after T2's schema file exists; ui-backend never imports the engine) → final review → fix pass → T6.

---

### Task 1: `merge facts edit` — the verb, its patch schema, its preview

**Files:**
- Modify: `engine/merge_facts/__init__.py` (`_step` at the `def _step` block; add `remove_path`, `unset_path`, `append_path` after `set_path`)
- Modify: `engine/merge_facts/verbs.py` (append `edit` and helpers after `promote`; extend the module docstring's "every writing verb" list)
- Modify: `engine/merge/cli.py` (the `_facts` dispatch and the `fsub` parsers)
- Create: `schemas/facts-patch.schema.json`; Modify: `schemas/README.md` (one row)
- Test: `engine/tests/test_merge_facts_verbs.py` (append a section), `engine/tests/test_facts_schema.py` (the new file validates as a schema, if that file enumerates schemas — read it first; otherwise the `tests/` frozen-contract test at the repo root picks up every `schemas/*.schema.json`: run `.venv/bin/pytest -q -k schema` and see the new file counted)

**Interfaces:**
- Consumes: `merge_facts.load_store/save_store/derive_status/get_path/set_path/is_open`, `merge_facts.apply._snapshot/_recompute_location`, `merge_facts.ladder.UNION_FIELDS["source"]` (the dedup key), `merge_facts.content.check_document`, `merge_facts.preconditions._unit_row_keys`, `merge_facts.conventions.load`, `engine_common.validate/read_json/write_json_atomic`.
- Produces: `verbs.edit(root, fact_id, patch_path, run_dir, preview=False) -> dict` returning `{"id": fact_id, "ops": [{"index", "op", "path", "before", "after"}], "problems": [str]}`; on a refusal it calls `_fail` (exit 2) after printing nothing but the stderr lines — **except** under `preview=True`, where it prints the block of §2.5 to stdout and returns the dict with `problems` (the CLI exits 2 when non-empty). `merge_facts.remove_path(entry, path)`, `unset_path(entry, path)`, `append_path(entry, path, value)`. The CLI: `merge facts edit --id --patch --run [--preview]`.
- Task 2 adds one line to `edit` (the ledger record) — leave a comment `# ledger: Task 2` after `save_store`.

**The patch schema** (`schemas/facts-patch.schema.json`):

```json
{"$schema": "https://json-schema.org/draft/2020-12/schema",
 "$id": "facts-patch.schema.json",
 "title": "Facts patch — one chat instruction's operations on one entry (v3.7 §2.2)",
 "type": "object", "additionalProperties": false,
 "required": ["schema_version", "ops"],
 "properties": {
   "schema_version": {"const": 1},
   "ops": {"type": "array", "minItems": 1, "items": {"$ref": "#/$defs/op"}}},
 "$defs": {
   "path": {"type": "string", "pattern": "^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$"},
   "op": {"type": "object", "additionalProperties": false,
          "required": ["op", "path"],
          "properties": {"op": {"enum": ["set", "remove", "unset", "append"]},
                         "path": {"$ref": "#/$defs/path"},
                         "value": {}},
          "if": {"properties": {"op": {"enum": ["set", "append"]}}},
          "then": {"required": ["value"]}}}}
```

- [ ] **Step 1 (RED):** append to `engine/tests/test_merge_facts_verbs.py`:

```python
# --------------------------------------------------------------------------- #
# v3.7 §2 — `merge facts edit`
# --------------------------------------------------------------------------- #
from merge_facts.verbs import edit

def _patch(root, name, ops):
    return _write(root, name, {"schema_version": 1, "ops": ops})

def _rule_entry(root, key="tol"):
    return [x for x in load_store(root)["rule"]["entries"] if x["key"] == key][0]

def _five(root):
    """The five store files as bytes — the 'nothing written' assertion."""
    from merge_facts import KIND_FILES, facts_dir
    return {n: (facts_dir(root) / n).read_bytes() for n in KIND_FILES.values()
            if (facts_dir(root) / n).is_file()}

def test_edit_sets_a_prose_leaf_the_ladder_never_rewrites(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule_entry(root)
    run = _run_dir(root, "2")
    edit(root, e["id"], _patch(root, "p.json",
         [{"op": "set", "path": "statement", "value": "حد مجاز انحراف هر پرس"}]), run)
    e2 = _rule_entry(root)
    assert e2["statement"] == "حد مجاز انحراف هر پرس"
    assert e2["updated_at"] != e["updated_at"]
    # provenance: one chat source naming the run, and the run's own record
    chat = [s for s in e2["source"] if s["type"] == "chat"]
    assert chat == [{"type": "chat", "ref": "runs/facts/cooking/2/meta.json",
                     "run": "runs/facts/cooking/2"}]
    assert (run / "facts-before" / "rules.json").is_file()
    assert json.loads((run / "facts-delta.json").read_text(encoding="utf-8")) == [
        {"verb": "edit", "args": {"id": e["id"], "patch": "p.json", "ops": 1}}]

def test_edit_set_remove_unset_append_in_order(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    delta = _const_delta(5)
    delta["entries"][0]["aliases"] = ["تلورانس"]
    delta["entries"][0]["data"]["outputs"][0]["per"] = "pizza"
    apply(root, _write(root, "d1.json", delta), _run_dir(root, "1"))
    e = _rule_entry(root)
    edit(root, e["id"], _patch(root, "p.json", [
        {"op": "set", "path": "data/outputs/v/value", "value": 7},
        {"op": "unset", "path": "data/outputs/v/per"},
        {"op": "append", "path": "aliases", "value": "حد مجاز"},
        {"op": "append", "path": "data/outputs",
         "value": {"key": "w", "title": "وزن", "unit": "g", "nature": "limit", "value": 1}},
        {"op": "remove", "path": "data/outputs/w"},
        {"op": "set", "path": "scope/departments", "value": ["cooking", "management"]},
    ]), _run_dir(root, "2"))
    e2 = _rule_entry(root)
    out = e2["data"]["outputs"]
    assert [o["key"] for o in out] == ["v"] and out[0]["value"] == 7 and "per" not in out[0]
    assert e2["aliases"] == ["تلورانس", "حد مجاز"]
    assert e2["scope"]["departments"] == ["cooking", "management"]

@pytest.mark.parametrize("ops, fragment", [
    ([{"op": "set", "path": "key", "value": "other"}], "identity"),
    ([{"op": "set", "path": "id", "value": "F-00099"}], "identity"),
    ([{"op": "set", "path": "status", "value": "confirmed"}], "derived"),
    ([{"op": "remove", "path": "source/0"}], "source"),
    ([{"op": "remove", "path": "data/outputs/nope"}], "not found"),
    ([{"op": "unset", "path": "data/nope"}], "not found"),
    ([{"op": "append", "path": "data/outputs", "value": {"key": "v", "value": 1}}], "already"),
    ([{"op": "set", "path": "statement", "value": "Table_Mavad را بخوان"}], "names"),
    ([{"op": "set", "path": "data/outputs/v/unit", "value": "stone"}], "unit"),
    ([{"op": "set", "path": "data/outputs/v", "value": {"key": "z", "value": 1}}], "key"),
])
def test_edit_refuses_and_writes_nothing(tmp_path, ops, fragment):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule_entry(root)
    before = _five(root)
    run = _run_dir(root, "2")
    with pytest.raises(SystemExit) as exc:
        edit(root, e["id"], _patch(root, "p.json", ops), run)
    assert exc.value.code == 2
    assert _five(root) == before
    assert not (run / "facts-before").exists() and not (run / "facts-delta.json").exists()

def test_edit_settles_a_dispute_three_ways(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    e = _disputed(root)                                   # values 5 and 4 on data/outputs/v/value
    # (a) the new value matches an account → chosen, the other rejected
    edit(root, e["id"], _patch(root, "p1.json",
         [{"op": "set", "path": "data/outputs/v/value", "value": 4}]), _run_dir(root, "3"))
    e = _rule_entry(root)
    assert {a["value"]: a["status"] for a in e["accounts"]} == {5: "rejected", 4: "chosen"}
    assert e["status"] == "confirmed"
    # (b) a value no account holds → a chosen chat account is appended, the rest rejected
    e = _disputed_again(root)
    edit(root, e["id"], _patch(root, "p2.json",
         [{"op": "set", "path": "data/outputs/v/value", "value": 9}]), _run_dir(root, "5"))
    e = _rule_entry(root)
    chosen = [a for a in e["accounts"] if a["status"] == "chosen"]
    assert len(chosen) == 1 and chosen[0]["value"] == 9 and chosen[0]["source"]["type"] == "chat"
    assert not [a for a in e["accounts"] if a["status"] == "open"]
    # (c) unset of a disputed path rejects every open account on it
    e = _disputed_again(root)
    edit(root, e["id"], _patch(root, "p3.json",
         [{"op": "set", "path": "data/outputs/v/value", "value": None}]), _run_dir(root, "7"))
    assert not [a for a in _rule_entry(root)["accounts"] if a["status"] == "open"]

def _disputed_again(root):
    """A fresh dispute on the same path after the previous one was settled."""
    import time
    n = str(int(time.time() * 1000) % 100000)
    apply(root, _write(root, f"d{n}.json", _const_delta(3)), _run_dir(root, n))
    return _rule_entry(root)

def test_edit_preview_prints_current_and_proposed_and_writes_nothing(tmp_path, capsys):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule_entry(root)
    before = _five(root)
    run = _run_dir(root, "2")
    report = edit(root, e["id"], _patch(root, "p.json",
                  [{"op": "set", "path": "statement", "value": "حد مجاز انحراف"}]), run,
                  preview=True)
    out = capsys.readouterr().out
    assert "[1] set statement" in out and "فعلی:" in out and "پیشنهاد:" in out
    assert "حد مجاز" in out and "حد مجاز انحراف" in out and out.rstrip().endswith("OK")
    assert report["problems"] == [] and report["ops"][0]["after"] == "حد مجاز انحراف"
    assert _five(root) == before and not (run / "facts-before").exists()

def test_edit_preview_reports_a_refusal_with_exit_2_from_the_cli(tmp_path, capsys):
    from merge.cli import main as merge_main
    import os
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule_entry(root)
    patch = _patch(root, "p.json", [{"op": "set", "path": "key", "value": "x"}])
    os.environ["DATA_ROOT"] = str(root)
    with pytest.raises(SystemExit) as exc:
        merge_main(["facts", "edit", "--id", e["id"], "--patch", str(patch),
                    "--run", str(_run_dir(root, "2")), "--preview"])
    assert exc.value.code == 2
    assert "identity" in capsys.readouterr().err

def test_revert_of_an_edit_restores_the_entry(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule_entry(root)
    run = _run_dir(root, "2")
    edit(root, e["id"], _patch(root, "p.json",
         [{"op": "set", "path": "statement", "value": "حد مجاز انحراف"}]), run)
    revert(root, run)
    e2 = _rule_entry(root)
    assert e2["statement"] == e["statement"] and e2["source"] == e["source"]

def test_an_accounts_member_is_addressed_by_its_id(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    e = _disputed(root)
    acc = e["accounts"][0]
    from merge_facts import get_path
    assert get_path(e, f"accounts/{acc['id']}") is acc
```

Check `_disputed` (already at the top of the file) yields two open accounts on `data/outputs/v/value`; `_disputed_again` applies a third value so a new dispute opens on the now-settled path — read `ladder._dispute` first: after (a), the path has no *open* account but does have accounts, so `_dispute` does not re-materialise the incumbent; the new challenger is appended open. Adjust `_disputed_again`'s expectations only if `ladder` behaves otherwise — never the verb's.

- [ ] **Step 2:** run `.venv/bin/pytest -q -k "test_edit or test_revert_of_an_edit or accounts_member" engine/tests/test_merge_facts_verbs.py` — every test fails on `ImportError: cannot import name 'edit'`.

- [ ] **Step 3 (GREEN):** `engine/merge_facts/__init__.py`:

```python
def _step(value, seg):
    if isinstance(value, dict):
        return value[seg]
    if isinstance(value, list):
        for member in value:
            # a keyed member by its `key`; an `accounts[]` member by its `id`
            # (the one keyed list whose members carry no `key`) — v3.7 §2.2
            if isinstance(member, dict) and seg in (member.get("key"), member.get("id")):
                return member
    raise KeyError(seg)


def _member_index(node, seg):
    for i, member in enumerate(node):
        if isinstance(member, dict) and seg in (member.get("key"), member.get("id")):
            return i
    raise KeyError(seg)


def remove_path(entry, path):
    """Delete the list member the last segment names (v3.7 §2.2 `remove`)."""
    parent, last = _parent(entry, path)
    if not isinstance(parent, list):
        raise TypeError(f"{path!r} is not a list member")
    del parent[_member_index(parent, last)]


def unset_path(entry, path):
    """Delete the dict key the last segment names (v3.7 §2.2 `unset`)."""
    parent, last = _parent(entry, path)
    if not isinstance(parent, dict):
        raise TypeError(f"{path!r} is not a field")
    del parent[last]


def append_path(entry, path, value):
    """Append `value` to the list at `path`, creating it on an existing parent."""
    parent, last = _parent(entry, path)
    if not isinstance(parent, dict):
        raise TypeError(f"{path!r} is not a field")
    node = parent.setdefault(last, [])
    if not isinstance(node, list):
        raise TypeError(f"{path!r} is not a list")
    node.append(value)


def _parent(entry, path):
    segs = path.split("/")
    node = entry
    for seg in segs[:-1]:
        node = _step(node, seg)
    return node, segs[-1]
```

`verbs.py` — after `promote`:

```python
_EDIT_IMMUTABLE = {"id": "identity", "kind": "identity (promote changes a note's kind)",
                   "key": "identity", "status": "derived", "updated_at": "derived"}


def _chat_source(run_ref):
    return {"type": "chat", "ref": f"{run_ref}/meta.json", "run": run_ref}


def _render(value, limit=400):
    """A value as the store holds it: a bare string, a Latin number, JSON for
    the rest; elided in the middle past `limit` characters (v3.7 §2.5)."""
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    if len(text) > limit:
        half = limit // 2
        text = text[:half] + "…" + text[-half:]
    return text


def _apply_op(entry, op):
    """One op on `entry`; returns (before, after) for the preview, raises
    KeyError/TypeError/ValueError with the refusal's own wording."""
    path, kind = op["path"], op["op"]
    head = path.split("/", 1)[0]
    if head in _EDIT_IMMUTABLE:
        raise ValueError(f"{path!r} is {_EDIT_IMMUTABLE[head]} and is never edited")
    if head == "source":
        raise ValueError("source[] is provenance and is never edited (repair-source-refs "
                         "is the one writer of a citation)")
    before = get_path(entry, path) if path_exists(entry, path) else None
    if kind == "set":
        value = op["value"]
        if isinstance(before, dict) and isinstance(value, dict) and "key" in before \
                and value.get("key") != before["key"]:
            raise ValueError(f"{path!r}: a member replaced by set keeps its key")
        parent, last = _parent(entry, path)
        if isinstance(parent, list) and not path_exists(entry, path):
            raise KeyError(last)
        set_path(entry, path, value) if path_exists(entry, path) or isinstance(parent, dict) \
            else None
        after = value
    elif kind == "remove":
        if not path_exists(entry, path):
            raise KeyError(path)
        remove_path(entry, path)
        after = None
    elif kind == "unset":
        if not path_exists(entry, path):
            raise KeyError(path)
        unset_path(entry, path)
        after = None
    else:                                             # append
        value = op["value"]
        node = get_path(entry, path) if path_exists(entry, path) else []
        keyfn = keyfn_for(path.rsplit("/", 1)[-1])
        if isinstance(value, dict) and any(isinstance(m, dict) and keyfn(m) == keyfn(value)
                                            for m in node):
            raise ValueError(f"{path!r}: a member with that key is already there — set it")
        append_path(entry, path, value)
        before, after = None, value
    return before, after
```

(`_parent`, `path_exists`, `remove_path`, `unset_path`, `append_path` are imported from `merge_facts`; `keyfn_for` from `merge_facts.ladder`; `json` is already imported.) Simplify the `set` branch to what the tests need: a `set` on an existing path replaces; a `set` on a missing leaf whose parent is a dict creates; a `set` naming a missing list member is `KeyError`.

```python
def _settle(entry, path, value, chat_src):
    """A set on a disputed path settles it (v3.7 §2.4)."""
    open_ = [a for a in entry.get("accounts") or [] if a.get("field") == path
             and a.get("status") == "open"]
    if not open_:
        return
    match = next((a for a in open_ if ladder._equal(a.get("value"), value)), None)
    for a in open_:
        a["status"] = "rejected"
    if match is not None:
        match["status"] = "chosen"
    elif value is not None:
        entry.setdefault("accounts", []).append(with_account_id({
            "field": path, "statement": str(value), "value": value,
            "source": {k: v for k, v in chat_src.items() if k != "run"},
            "speaker_role": None, "status": "chosen"}))
    _clear_unit_ref(entry, path)


def _gate(root, store, kind, entry):
    """The store gate every run passes, on this one entry (v3.7 §2.3 item 4)."""
    problems = []
    try:
        validate("facts.schema.json", store[kind])
    except ValueError as exc:
        problems.append(str(exc))
    doc = {"schema_version": store[kind]["schema_version"], "entries": [entry]}
    problems += check_document(doc, "facts", store=store,
                               unit_symbols=_unit_row_keys(store, []),
                               conventions=conventions.load(root))
    for obj in iter_ref_objects(entry.get("data") or {}):
        ref = obj.get("ref")
        if isinstance(ref, str) and FACT_ID_RE.fullmatch(ref) and _find(store, ref)[1] is None:
            problems.append(f"{entry['id']}: ref {ref} names no entry")
    return problems


def edit(root, fact_id, patch_path, run_dir, preview=False):
    """v3.7 §2 — set/remove/unset/append on one entry, gated by the store's own
    gate, settling any dispute it touches, provenance as a chat source."""
    root, run_dir = pathlib.Path(root), pathlib.Path(run_dir)
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
    ops, problems = [], []
    for i, op in enumerate(patch["ops"], 1):
        try:
            before, after = _apply_op(work, op)
        except KeyError as exc:
            problems.append(f"op {i} {op['op']} {op['path']}: not found ({exc})"); break
        except (TypeError, ValueError) as exc:
            problems.append(f"op {i} {op['op']} {op['path']}: {exc}"); break
        ops.append({"index": i, "op": op["op"], "path": op["path"],
                    "before": before, "after": after})
        if op["op"] == "set":
            _settle(work, op["path"], op["value"], chat_src)
        else:
            _settle(work, op["path"], None, chat_src)
    if not problems:
        work["field_status"] = {p: v for p, v in (work.get("field_status") or {}).items()
                                if path_exists(work, p)} or work.get("field_status")
        if not work.get("field_status"):
            work.pop("field_status", None)
        _recompute_location(work)
        srcs = work.setdefault("source", [])
        key = UNION_FIELDS["source"]
        if key(chat_src) not in {key(s) for s in srcs}:
            srcs.append(chat_src)
        work["status"] = derive_status(work)
        work["updated_at"] = _now()
        trial = copy.deepcopy(store)
        trial[kind]["entries"] = [work if e["id"] == fact_id else e
                                  for e in trial[kind]["entries"]]
        problems += _gate(root, trial, kind, work)
    report = {"id": fact_id, "ops": ops, "problems": problems}
    if preview:
        for o in ops:
            print(f"[{o['index']}] {o['op']} {o['path']}")
            if o["before"] is not None:
                print(f"    فعلی:    {_render(o['before'])}")
            if o["after"] is not None:
                print(f"    پیشنهاد: {_render(o['after'])}")
        if problems:
            for msg in problems:
                print(f"precondition failed: {msg}", file=sys.stderr)
            raise SystemExit(2)
        print("OK")
        return report
    if problems:
        for msg in problems:
            print(f"precondition failed: {msg}", file=sys.stderr)
        raise SystemExit(2)
    store[kind]["entries"] = trial[kind]["entries"]
    _snapshot(root, run_dir)
    save_store(root, store)
    # ledger: Task 2
    _append_delta(run_dir, "edit", {"id": fact_id, "patch": pathlib.Path(patch_path).name,
                                    "ops": len(ops)})
    return report
```

Imports to add at the top of `verbs.py`: `json`; `from merge_facts import path_exists, remove_path, unset_path, append_path, _parent, iter_ref_objects`; `from merge_facts import ladder`; `from merge_facts.ladder import UNION_FIELDS, keyfn_for, with_account_id`; `from merge_facts.apply import _recompute_location, _run_ref`; `from merge_facts.content import check_document`; `from merge_facts.preconditions import FACT_ID_RE, _unit_row_keys`; `from merge_facts import conventions`; `from engine_common import validate`. Check each name exists where the plan says (`FACT_ID_RE` is re-exported by `apply` from `preconditions`; `validate` is in `engine_common`).

`merge/cli.py` — in `_facts`:

```python
        elif args.facts_cmd == "edit":
            report = edit_facts(data_root(), args.id, args.patch, args.run,
                                preview=args.preview)
            if not args.preview:
                print(f"edited {args.id} — {len(report['ops'])} change(s)")
```

and the parser:

```python
    fed = fsub.add_parser("edit")
    fed.add_argument("--id", required=True)
    fed.add_argument("--patch", required=True)
    fed.add_argument("--run", required=True)
    fed.add_argument("--preview", action="store_true")
```

with `from merge_facts.verbs import edit as edit_facts` beside the other imports. Add the README row: `facts-patch.schema.json | one chat instruction's operations on one entry — v3.7 §2.2 | merge facts edit`.

- [ ] **Step 4:** run the scoped tests until green; then `.venv/bin/pytest -q -k "merge_facts or schema"`; then the whole `engine/tests` once.
- [ ] **Step 5:** commit `feat(facts): merge facts edit — the human verb §11 promised`.

### Task 2: The chat confirmation ledger — `facts/.confirmations.json`

**Files:**
- Create: `engine/merge_facts/ledger.py`; `schemas/facts-confirmations.schema.json`
- Modify: `engine/merge_facts/__init__.py` (`save_store` prunes), `engine/merge_facts/verbs.py` (`edit` always records; `resolve`/`retire`/`promote` record under `origin: chat`), `engine/merge_facts/apply.py` (`_write` records under `origin: chat`), `engine/merge_facts/revert.py` (forget the run's rows), `schemas/README.md`, `docs/runbooks/07-facts.md` (new §13 «Editing through the bot» + a sentence in §6), `docs/decisions/0017-facts-pipeline-v3.md` (I7 line)
- Test: `engine/tests/test_merge_facts_ledger.py` (new)

**Interfaces:**
- Consumes: Task 1's `edit`; `engine_common.read_json/write_json_atomic/validate`; `merge_facts.facts_dir`.
- Produces: `ledger.LEDGER = ".confirmations.json"`; `ledger.load(root) -> dict` (the document, `{"schema_version": 1, "entries": {}}` when absent); `ledger.save(root, doc)`; `ledger.prune(root, store) -> int` (rows whose `updated_at` ≠ the entry's, or whose entry is gone; called by `save_store` AFTER the five files are written; returns the count dropped); `ledger.record(root, run_dir, entries: list[dict])` (one row per entry, `by` = `meta.json`'s `actor` or `"chat"` when the file is absent, `run` = the run ref, `at` = now — **only when** `chat_origin(run_dir)` is true, which `edit` bypasses by calling `record(..., force=True)`); `ledger.chat_origin(run_dir) -> bool` (`{run_dir}/meta.json` exists and `origin == "chat"`); `ledger.forget_run(root, run_ref) -> int`.

The schema:

```json
{"$schema": "https://json-schema.org/draft/2020-12/schema",
 "$id": "facts-confirmations.schema.json",
 "title": "Chat confirmations — the chat actor's vouch per entry (v3.7 §3)",
 "type": "object", "additionalProperties": false,
 "required": ["schema_version", "entries"],
 "properties": {
   "schema_version": {"const": 1},
   "entries": {"type": "object",
               "propertyNames": {"pattern": "^F-[0-9]{5}$"},
               "additionalProperties": {
                 "type": "object", "additionalProperties": false,
                 "required": ["updated_at", "by", "run", "at"],
                 "properties": {"updated_at": {"$ref": "#/$defs/iso"},
                                "by": {"type": "string", "minLength": 1},
                                "run": {"type": "string", "minLength": 1},
                                "at": {"$ref": "#/$defs/iso"}}}}},
 "$defs": {"iso": {"type": "string",
                   "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$"}}}
```

- [ ] **Step 1 (RED):** `engine/tests/test_merge_facts_ledger.py`:

```python
import json
import pytest
from facts_helpers import _root, _seed_units, _const_delta, _write, _run_dir
from merge_facts import load_store, facts_dir
from merge_facts.apply import apply
from merge_facts.revert import revert
from merge_facts.verbs import edit, retire
from merge_facts import ledger


def _meta(run, origin="chat", actor="owner"):
    (run / "meta.json").write_text(json.dumps({
        "department": "cooking", "origin": origin, "actor": actor,
        "started_at": "2026-09-09T09:00:00Z", "finished_at": None,
        "recordings": [], "attachments": [], "workbooks": [], "delta": "",
        "merged": False, "ids_created": []}), encoding="utf-8")

def _rows(root):
    return ledger.load(root)["entries"]

def _rule(root):
    return [x for x in load_store(root)["rule"]["entries"] if x["key"] == "tol"][0]

def test_edit_always_records_the_chat_actor(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule(root)
    run = _run_dir(root, "2"); _meta(run)
    edit(root, e["id"], _write(root, "p.json", {"schema_version": 1, "ops": [
        {"op": "set", "path": "statement", "value": "حد مجاز انحراف"}]}), run)
    e2 = _rule(root)
    row = _rows(root)[e["id"]]
    assert row["updated_at"] == e2["updated_at"] and row["by"] == "owner"
    assert row["run"] == "runs/facts/cooking/2"
    from engine_common import validate
    validate("facts-confirmations.schema.json", ledger.load(root))

def test_apply_records_only_under_a_chat_origin(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    run = _run_dir(root, "1")                       # no meta.json: a pipeline run
    apply(root, _write(root, "d1.json", _const_delta(5)), run)
    assert _rows(root) == {}
    run2 = _run_dir(root, "2"); _meta(run2)
    apply(root, _write(root, "d2.json", _const_delta(5, key="b")), run2)
    b = [x for x in load_store(root)["rule"]["entries"] if x["key"] == "b"][0]
    assert _rows(root) == {b["id"]: {"updated_at": b["updated_at"], "by": "owner",
                                     "run": "runs/facts/cooking/2",
                                     "at": _rows(root)[b["id"]]["at"]}}
    run3 = _run_dir(root, "3"); _meta(run3, origin="pipeline")
    apply(root, _write(root, "d3.json", _const_delta(5, key="c")), run3)
    assert set(_rows(root)) == {b["id"]}

def test_retire_under_chat_origin_records_and_a_later_write_prunes(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule(root)
    run = _run_dir(root, "2"); _meta(run)
    retire(root, e["id"], None, run)
    assert e["id"] in _rows(root)
    # a pipeline apply that disputes the value stamps the entry → the row goes
    apply(root, _write(root, "d2.json", _const_delta(4)), _run_dir(root, "3"))
    assert e["id"] not in _rows(root)

def test_revert_forgets_the_runs_rows(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule(root)
    run = _run_dir(root, "2"); _meta(run)
    edit(root, e["id"], _write(root, "p.json", {"schema_version": 1, "ops": [
        {"op": "set", "path": "statement", "value": "حد مجاز انحراف"}]}), run)
    revert(root, run)
    assert _rows(root) == {}

def test_a_missing_ledger_reads_empty_and_a_stale_row_is_pruned_on_save(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    assert ledger.load(root) == {"schema_version": 1, "entries": {}}
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule(root)
    doc = ledger.load(root)
    doc["entries"][e["id"]] = {"updated_at": "2000-01-01T00:00:00Z", "by": "x",
                               "run": "runs/facts/cooking/0", "at": "2000-01-01T00:00:00Z"}
    doc["entries"]["F-09999"] = dict(doc["entries"][e["id"]])
    ledger.save(root, doc)
    from merge_facts import save_store
    save_store(root, load_store(root))
    assert _rows(root) == {}
```

- [ ] **Step 2:** run `.venv/bin/pytest -q engine/tests/test_merge_facts_ledger.py` — fails on `ImportError` (`ledger`).
- [ ] **Step 3 (GREEN):** `engine/merge_facts/ledger.py`:

```python
"""`facts/.confirmations.json` — the chat actor's vouch per entry (v3.7 §3).

A row says: the actor named in the run's `meta.json` instructed the change
that left this entry at this `updated_at`. The ui-backend reads it beside its
own `app.db` marks and shows the entry confirmed while the two `updated_at`s
agree; every engine write path stamps the entries it changes, so a later
change by anything moves the entry's stamp and the row goes stale on its
own — `prune` (run by `save_store`) drops it.
"""
import pathlib
from datetime import datetime, timezone

from engine_common import read_json, validate, write_json_atomic

LEDGER = ".confirmations.json"
EMPTY = {"schema_version": 1, "entries": {}}


def _path(root):
    from merge_facts import facts_dir
    return facts_dir(pathlib.Path(root)) / LEDGER


def load(root):
    p = _path(root)
    return read_json(p) if p.is_file() else {"schema_version": 1, "entries": {}}


def save(root, doc):
    validate("facts-confirmations.schema.json", doc)
    write_json_atomic(_path(root), doc)


def chat_origin(run_dir):
    meta = pathlib.Path(run_dir) / "meta.json"
    if not meta.is_file():
        return False
    try:
        return read_json(meta).get("origin") == "chat"
    except ValueError:
        return False


def _actor(run_dir):
    meta = pathlib.Path(run_dir) / "meta.json"
    if meta.is_file():
        try:
            actor = read_json(meta).get("actor")
            if isinstance(actor, str) and actor:
                return actor
        except ValueError:
            pass
    return "chat"


def record(root, run_dir, run_ref, entries, force=False):
    """One row per entry — only for a chat-origin run unless `force`
    (`edit` exists for chat instructions and records always)."""
    if not entries or not (force or chat_origin(run_dir)):
        return 0
    doc = load(root)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    by = _actor(run_dir)
    for entry in entries:
        doc["entries"][entry["id"]] = {"updated_at": entry["updated_at"], "by": by,
                                       "run": run_ref, "at": now}
    save(root, doc)
    return len(entries)


def prune(root, store):
    """Drop every row whose entry is gone or whose `updated_at` moved."""
    p = _path(root)
    if not p.is_file():
        return 0
    doc = load(root)
    stamps = {e["id"]: e.get("updated_at") for kind in store for e in store[kind]["entries"]}
    keep = {fid: row for fid, row in doc["entries"].items()
            if stamps.get(fid) == row.get("updated_at")}
    dropped = len(doc["entries"]) - len(keep)
    if dropped:
        doc["entries"] = keep
        save(root, doc)
    return dropped


def forget_run(root, run_ref):
    p = _path(root)
    if not p.is_file():
        return 0
    doc = load(root)
    keep = {fid: row for fid, row in doc["entries"].items() if row.get("run") != run_ref}
    dropped = len(doc["entries"]) - len(keep)
    if dropped:
        doc["entries"] = keep
        save(root, doc)
    return dropped
```

`__init__.py` `save_store`: after writing the index, `from merge_facts import ledger` (local import to avoid a cycle) and `ledger.prune(root, store)`. `apply._write`: after `save_store`, `ledger.record(root, run_dir, run_ref, [t["entry"] for t in touched if t["changed"]])`. `verbs.edit`: replace the `# ledger: Task 2` comment with `ledger.record(root, run_dir, run_ref, [work], force=True)`; `resolve`/`retire`/`promote`: after `save_store`, `ledger.record(root, run_dir, _run_ref(root, run_dir), [entry])`. `revert.revert`: after `save_store`, `ledger.forget_run(root, _run_ref(root, run_dir))` (`_run_ref` imported from `apply`). README row for the new schema. Runbook §13 «Editing through the bot» (the verb, the patch, the preview, the ledger, revert, and that the store's `git add` allowlist already covers `facts/`); §6 gains «a reverted chat run also forgets its ledger rows». ADR 0017: one line for I7.

- [ ] **Step 4:** `.venv/bin/pytest -q -k "ledger or merge_facts or revert"`; then all of `engine/tests`.
- [ ] **Step 5:** commit `feat(facts): the chat confirmation ledger — a chat run leaves its entries vouched for`.

### Task 3: The ui-backend honours the ledger

**Files:**
- Create: `ui-backend/inja_ui_backend/store/chat_confirmations.py`
- Modify: `ui-backend/inja_ui_backend/routers/facts.py` (`list_facts` — the block computing `now`/`confirmed`; `get_fact` — the `confirmation` object), `ui-backend/inja_ui_backend/routers/confirmations.py` (`_row`, `list_confirmations`, `revoke_confirmation`)
- Test: `ui-backend/tests/test_facts_confirmations.py` (append)

**Interfaces:**
- Consumes: the ledger file of Task 2 (`facts/.confirmations.json`, §3.2 shape) — read only, never the engine module.
- Produces: `chat_confirmations.load(root: Path) -> dict[str, dict]` (id → row; `{}` when the file is absent or unreadable); `chat_confirmations.confirmed(rows, entry) -> bool` (`rows.get(entry["id"], {}).get("updated_at") == entry.get("updated_at")`); `chat_confirmations.forget(root, fid) -> bool` (removes the row, atomic write, `True` when one was removed).

- [ ] **Step 1 (RED):** append to `ui-backend/tests/test_facts_confirmations.py` (use the file's own `_plant`-style helpers; read its first 130 lines for `_client`, `_seed_store` or whatever it names them, and reuse):

```python
def _ledger(data_root, rows):
    (data_root / "facts" / ".confirmations.json").write_text(json.dumps(
        {"schema_version": 1, "entries": rows}, ensure_ascii=False), encoding="utf-8")

def test_a_ledger_row_at_the_entrys_stamp_reads_as_confirmed(data_root, tmp_path):
    # plant the store the file's other tests plant, then a ledger row for RULE
    # at exactly its updated_at
    ...
    entry = facts_store.load_entry(data_root, RULE)
    _ledger(data_root, {RULE: {"updated_at": entry["updated_at"], "by": "owner",
                               "run": "runs/facts/cooking/20260909-091210",
                               "at": "2026-09-09T09:12:31Z"}})
    c = <a signed-in editor client as the file makes one>
    body = c.get(f"/api/facts/{RULE}").json()
    assert body["confirmation"]["confirmed"] is True
    rows = {r["id"]: r for r in c.get("/api/facts?department=cooking").json()["entries"]}
    assert rows[RULE]["confirmed"] is True
    listing = c.get("/api/confirmations?department=cooking").json()
    assert next(r for r in listing if r["target"] == RULE)["confirmed"] is True

def test_a_ledger_row_at_an_older_stamp_is_not_a_confirmation(data_root, tmp_path):
    ... _ledger(data_root, {RULE: {"updated_at": "2000-01-01T00:00:00Z", ...}})
    assert c.get(f"/api/facts/{RULE}").json()["confirmation"]["confirmed"] is False

def test_revoke_removes_a_ledger_row_and_says_so(data_root, tmp_path):
    ... plant a matching ledger row; c = editor with confirm on cooking
    r = c.delete(f"/api/confirmations/{RULE}")
    assert r.status_code == 200 and r.json()["confirmed"] is False
    assert RULE not in json.loads((data_root / "facts" / ".confirmations.json")
                                  .read_text(encoding="utf-8"))["entries"]
    events = <the audit events the file's other tests read>
    assert any(e["event"] == "confirmation.revoked" and e["detail"].get("chat") is True
               for e in events)

def test_a_db_mark_still_wins_when_the_ledger_is_stale(data_root, tmp_path):
    ... confirm through POST /api/confirmations/{RULE} with the served fingerprint,
    plant a stale ledger row, assert confirmed is True
```

Fill the `...` from the file's existing helpers — the first 130 lines of the file define how a store is planted and a client made; copy those calls, do not invent new fixtures.

- [ ] **Step 2:** run `.venv/bin/pytest -q ui-backend/tests/test_facts_confirmations.py -k ledger` — fails (`confirmed` is `False`, module missing).
- [ ] **Step 3 (GREEN):** `store/chat_confirmations.py`:

```python
"""The chat actor's vouch per entry — `facts/.confirmations.json`, written by
the engine on chat-origin runs (v3.7 §3), read here beside `app.db`'s marks.
A row counts while its `updated_at` equals the entry's; the engine stamps
every entry it changes, so the row stops matching the way a fingerprint does."""
import json
from pathlib import Path

LEDGER = Path("facts") / ".confirmations.json"


def load(root: Path) -> dict[str, dict]:
    path = root / LEDGER
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    rows = doc.get("entries") if isinstance(doc, dict) else None
    return rows if isinstance(rows, dict) else {}


def confirmed(rows: dict[str, dict], entry: dict) -> bool:
    row = rows.get(entry.get("id") or "")
    return isinstance(row, dict) and row.get("updated_at") == entry.get("updated_at")


def forget(root: Path, fid: str) -> bool:
    path = root / LEDGER
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    rows = doc.get("entries") if isinstance(doc, dict) else None
    if not isinstance(rows, dict) or fid not in rows:
        return False
    del rows[fid]
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
    return True
```

`routers/facts.py`: in the list route, `chat = chat_confirmations.load(root)` once before the loop; `"confirmed": (mark is not None and mark == now) or chat_confirmations.confirmed(chat, entry)`. In the detail route the same with one `load`. `routers/confirmations.py`: `_row` and `list_confirmations` take the ledger into account the same way for `F-` targets (`_kind(target) == "fact"`); `revoke_confirmation`: `chat = chat_confirmations.forget(cfg.data_root, target) if _kind(target) == "fact" else False`, and the event's `detail` gains `"chat": chat` when either the DB row or the ledger row was removed; `_row`'s `confirmed_by` reports `f"chat:{row['by']}"` when only the ledger vouches.

- [ ] **Step 4:** `.venv/bin/pytest -q ui-backend/tests/test_facts_confirmations.py ui-backend/tests/test_facts_api.py ui-backend/tests/test_confirmations_api.py`; then the whole `ui-backend/tests`.
- [ ] **Step 5:** commit `feat(ui-backend): a chat edit's entry is confirmed — the ledger beside app.db`.

### Task 4: One row shape for a decision table (I8)

**Files:**
- Modify: `schemas/facts.schema.json` and `schemas/facts-delta.schema.json` (`$defs.ruleData.properties.table`), `engine/merge_facts/content.py` (add `_check_table_shape` and call it from `check_document` after `_check_constant_shape`), `engine/facts_plan/build.py` (`KIND_NOTE["rule"]`; `EXAMPLES` fourth member), `ui/src/api/types.ts` (`RuleData.table.rows`), `ui/src/facts/cards/RuleCard.tsx` (`cellOf` becomes `row[key]`), `ui/src/facts/cards/RuleCard.test.tsx` (`TABLE` fixture flat; drop the nested-shape wording), `docs/decisions/0017-facts-pipeline-v3.md` (I8 line)
- Test: `engine/tests/test_validate_facts_content.py` (append section 9), `engine/tests/test_facts_plan_cards.py` (examples now four; the card names the fourth shape), `engine/tests/test_facts_schema.py` (if it pins `table`)

**Interfaces:**
- Produces: `content._check_table_shape(entry, messages, label)`; the schema's `table` object; `EXAMPLES[3]` (a `rule` with `lang: table`).

The schema fragment (both files, identical):

```json
"table": {"type": "object", "additionalProperties": false,
          "required": ["inputs", "outputs", "rows"],
          "properties": {
            "inputs": {"type": "array", "items": {"$ref": "#/$defs/mintedSegment"}},
            "outputs": {"type": "array", "items": {"$ref": "#/$defs/mintedSegment"}},
            "rows": {"type": "array", "items": {"type": "object"}},
            "hit": {"enum": ["first", "unique", "collect", null]},
            "aggregate": {"enum": ["sum", "product", "min", "max", null]},
            "default": {"type": "object"}}}
```

- [ ] **Step 1 (RED):** append to `engine/tests/test_validate_facts_content.py`:

```python
# --------------------------------------------------------------------------- #
# 9. decision-table row shape — v3.7 §4 (I8)
# --------------------------------------------------------------------------- #

def _table_rule(rows, **table_extra):
    table = {"inputs": ["goruh"], "outputs": ["mabna"], "rows": rows, **table_extra}
    return _rule(data={"lang": "table", "expr": None,
                       "inputs": [{"key": "goruh", "title": "گروه قلم"}],
                       "outputs": [{"key": "mabna", "title": "مبنای ثبت"}],
                       "table": table})

def test_flat_rows_keyed_by_the_columns_pass():
    rule = _table_rule([{"goruh": "پنیر گودا", "mabna": "کارتن"},
                        {"goruh": "نوشیدنی", "mabna": "تعداد"}])
    assert [m for m in check_document(_doc(rule), "facts-delta") if "table" in m] == []

def test_the_old_nested_when_then_rows_are_named():
    rule = _table_rule([{"when": {"goruh": "پنیر گودا"}, "then": {"mabna": "کارتن"}}])
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("when/then" in m and "row 1" in m for m in msgs)

def test_a_row_key_outside_the_columns_and_a_row_with_no_output_fail():
    msgs = check_document(_doc(_table_rule([{"goruh": "x", "vazn": 1}])), "facts-delta")
    assert any("vazn" in m and "column" in m for m in msgs)
    msgs = check_document(_doc(_table_rule([{"goruh": "x"}])), "facts-delta")
    assert any("no output" in m for m in msgs)

def test_table_columns_must_be_declared_inputs_and_outputs():
    rule = _table_rule([{"goruh": "x", "mabna": "y"}])
    rule["data"]["table"]["inputs"] = ["ruz"]
    msgs = check_document(_doc(rule), "facts-delta")
    assert any("ruz" in m and "declared" in m for m in msgs)

def test_a_table_rule_carries_no_expr_and_a_feel_rule_no_table():
    rule = _table_rule([{"goruh": "x", "mabna": "y"}])
    rule["data"]["expr"] = "mabna = goruh"
    assert any("expr" in m for m in check_document(_doc(rule), "facts-delta"))
    rule = _table_rule([{"goruh": "x", "mabna": "y"}])
    rule["data"]["lang"] = "feel"; rule["data"]["expr"] = "mabna = goruh"
    assert any("table" in m and "lang" in m for m in check_document(_doc(rule), "facts-delta"))

def test_the_two_cooking_tables_pass(tmp_path):
    """F-00193 and F-00194 as the 2026-09-08 run wrote them — fixture copies."""
    import pathlib
    fixtures = pathlib.Path(__file__).parent / "fixtures" / "facts_store" / "tables.json"
    doc = json.loads(fixtures.read_text(encoding="utf-8"))
    assert [m for m in check_document(doc, "facts") if "table" in m] == []
```

Write `engine/tests/fixtures/facts_store/tables.json` as `{"schema_version": 1, "entries": [<F-00193>, <F-00194>]}` copied from the live store (`../../../data-repo/facts/rules.json`, the two entries verbatim — read them with `python3 -c` and paste). Also in `test_facts_plan_cards.py` change `["record", "measurement", "rule"]` to `["record", "measurement", "rule", "rule"]` and add:

```python
def test_the_shape_card_names_the_decision_table_shape():
    from facts_plan.build import shape_card
    card = shape_card(("rule",), _schema())
    assert "lang: table" in card and "rows[]" in card
```

- [ ] **Step 2:** run `.venv/bin/pytest -q -k "table or examples or shape_card" engine/tests/test_validate_facts_content.py engine/tests/test_facts_plan_cards.py` — the new ones fail.
- [ ] **Step 3 (GREEN):** `content.py`:

```python
# --------------------------------------------------------------------------- #
# 9. decision-table row shape (v3.7 §4, I8)
# --------------------------------------------------------------------------- #

def _check_table_shape(entry, messages, label):
    if entry.get("kind") != "rule":
        return
    data = entry.get("data") or {}
    table = data.get("table")
    if data.get("lang") == "table":
        if not isinstance(table, dict):
            messages.append(f"{label}: lang: table carries no table")
            return
        if data.get("expr"):
            messages.append(f"{label}: a table rule carries expr — a table has no formula")
    elif table is not None:
        messages.append(f"{label}: carries a table but its lang is not table")
        return
    else:
        return
    declared_in = {i.get("key") for i in data.get("inputs") or [] if isinstance(i, dict)}
    declared_out = {o.get("key") for o in data.get("outputs") or [] if isinstance(o, dict)}
    ins = [k for k in table.get("inputs") or [] if isinstance(k, str)]
    outs = [k for k in table.get("outputs") or [] if isinstance(k, str)]
    for k in ins:
        if k not in declared_in:
            messages.append(f"{label}: table input {k!r} is not a declared input")
    for k in outs:
        if k not in declared_out:
            messages.append(f"{label}: table output {k!r} is not a declared output")
    columns = set(ins) | set(outs)
    for n, row in enumerate(table.get("rows") or [], 1):
        if not isinstance(row, dict):
            messages.append(f"{label}: row {n} is not an object")
            continue
        if "when" in row or "then" in row:
            messages.append(f"{label}: row {n} carries when/then — a row is flat, "
                            f"keyed by the table's columns")
            continue
        for k in row:
            if k not in columns:
                messages.append(f"{label}: row {n} key {k!r} is not a table column")
        if not any(k in row for k in outs):
            messages.append(f"{label}: row {n} names no output")
    for k in table.get("default") or {}:
        if k not in outs:
            messages.append(f"{label}: default key {k!r} is not a table output")
```

Call it in `check_document` right after `_check_constant_shape`. The schema fragment above into both schema files. `KIND_NOTE["rule"]` gains: «… جدول تصمیم — `lang: table`، `expr` خالی، و `table` با `inputs`/`outputs` (کلیدهای همان ورودی و خروجی‌ها) و `rows[]` که هر سطر یک شیء تخت است با همان کلیدها». `EXAMPLES` gains:

```python
    {"kind": "rule", "key": "mabnaye_sabt_mande",
     "title": "مبنای ثبت ماندهٔ پایان شب",
     "statement": "مبنای ثبت ماندهٔ پایان شب برای هر گروه از اقلام متفاوت است: گروهی "
                  "با وزن و گروهی با تعداد ثبت می‌شوند.",
     "data": {"lang": "table", "expr": None,
              "inputs": [{"key": "goruh_qalam", "title": "گروه قلم"}],
              "outputs": [{"key": "mabnaye_sabt", "title": "مبنای ثبت مانده"}],
              "table": {"inputs": ["goruh_qalam"], "outputs": ["mabnaye_sabt"],
                        "rows": [{"goruh_qalam": "بیکن ورقه‌ای", "mabnaye_sabt": "فقط وزن"},
                                 {"goruh_qalam": "نوشیدنی‌های کانتر", "mabnaye_sabt": "تعداد"}]}}}
```

UI: `types.ts` — `rows?: Record<string, unknown>[]` keeps its comment shortened to «flat rows keyed by the table's columns (v3.7 I8)»; `RuleCard.tsx` — delete `cellOf`, use `tableCell(row[k], …)`; `RuleCard.test.tsx` — the `TABLE` fixture's rows become `{ weekday: 'thu', coefficient: 1.2 }` etc. and the `FLAT` fixture in «what the engine writes» stays. Run `cd ui && ./node_modules/.bin/vitest run src/facts/cards/RuleCard` and `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`.

- [ ] **Step 4:** `.venv/bin/pytest -q -k "content or cards or schema or facts_plan"`; the ui tests; then `engine/tests` whole.
- [ ] **Step 5:** commit `feat(facts): one row shape for a decision table — flat, keyed by the columns, checked at the gate (I8)`.

### Task 5: The playbook and the agent learn the patch (data-repo)

**Files (data worktree `…/data-repo.facts-v3-gate`):**
- First: `git -C <data-worktree> merge --ff-only main` (the branch is behind `main` by the accounting run's commit; fast-forward, no merge commit).
- Modify: `.claude/skills/edit-fact/SKILL.md` (Steps 1, 3, 4, 5, 6 per spec §5; delete the old 4.B/5 account hunt), `.claude/agents/quantify.md` (the `targeted` section per spec §6), `CLAUDE.md` (the pointer table's `edit-fact` row; the hard-rules line gains «and `runs/facts/{dept}/{stamp}/facts-patch.json`»), `.claude/hooks/test_guard.py`, `.claude/hooks/test_playbook_lint.py`
- Test: the two hook files, run with the code worktree's venv: `<code>/.venv/bin/pytest -q <data-worktree>/.claude/hooks`

**Interfaces:** consumes Task 1's CLI shape (`merge facts edit --id F-… --patch {run_dir}/facts-patch.json --run {run_dir} [--preview]`) and Task 2's «در پنل تأییدشده است» fact (the ledger row is written by the verb; the playbook only says so).

- [ ] **Step 1 (RED):** `test_guard.py` gains:

```python
def test_allow_merge_facts_edit_with_a_patch_under_runs(tmp_path):
    assert run(bash("DATA_ROOT=/data merge facts edit --id F-00150 --patch "
                    "runs/facts/cooking/20260909-091210/facts-patch.json "
                    "--run runs/facts/cooking/20260909-091210 --preview"), tmp_path) == 0

def test_allow_writing_the_patch_file_under_runs(tmp_path):
    assert run(w("runs/facts/cooking/20260909-091210/facts-patch.json"), tmp_path) == 0

def test_block_bash_write_into_the_ledger(tmp_path):
    assert run(bash("echo '{}' > facts/.confirmations.json"), tmp_path) == 2
```

`test_playbook_lint.py` gains (following its `test_review_mode_says_…` pattern — read `_agent_text()`/the helper it uses):

```python
def test_targeted_mode_names_its_two_output_files():
    text = AGENT.read_text(encoding="utf-8")
    section = text.split("### `targeted` mode", 1)[1].split("\n---", 1)[0]
    assert "facts-patch.json" in section and "facts-delta.json" in section
    assert "\"op\": \"set\"" in section or "`set`" in section

def test_the_edit_fact_playbook_has_the_three_case_table_and_no_account_hunt():
    text = (ROOT / ".claude" / "skills" / "edit-fact" / "SKILL.md").read_text(encoding="utf-8")
    assert "merge facts edit" in text and "--preview" in text
    assert "facts-patch.json" in text
    assert "در پنل تأییدشده است" in text
    assert "account id" not in text.lower() or "Never compute an account id" not in text
```

- [ ] **Step 2:** run the hooks — the new tests fail (guard case 3 may already block: keep it as a pin).
- [ ] **Step 3 (GREEN):** rewrite `SKILL.md` Steps 3–6 to spec §5 verbatim in structure (the case table; «no question» for a mechanical change; one question for composed prose, removals, retire/merge; the preview's own lines in the report; the closing sentence «در پنل تأییدشده است»); the patch example block (spec §2.2, path grammar); Step 1's many-entry rule; delete the old 4.B and the account-by-value paragraph. `quantify.md` `targeted` section: two output forms, the path grammar, the table of §5 in two lines, «Touch no path the instruction did not ask about». `CLAUDE.md`: the pointer row says «→ `merge facts edit` for a change, `apply` for an addition, `retire` for a retirement». The guard needs no code change unless `test_block_bash_write_into_the_ledger` fails — `FACTS_CMD_RE` already matches `facts/.confirmations.json`; if it does not, widen the regex minimally.
- [ ] **Step 4:** hooks green; every `persian` block in `SKILL.md` free of ids/paths/commands (the lint's own rule).
- [ ] **Step 5:** commit on the data worktree `docs(edit-fact): the playbook writes a patch, previews it, and the entry comes out confirmed`.

### Task 6: Rollout (controller)

1. Final whole-branch review (Opus) over Tasks 1–5; fix pass; scoped re-review.
2. Merge code `facts-v3-gate` → `main`; merge data `facts-v3-gate` → `main` **only while the bot is idle** (`docker exec … pgrep claude` empty; the last bot message older than ten minutes).
3. `cd deploy && docker compose -f docker-compose.local.yml up -d --build control-bot ui-backend` (both images bake the engine); `cd ui && npm run build` on main. Verify inside the control-bot container: `merge facts edit --help` shows `--preview`; a `--preview` on `F-00150` against a scratch run dir under `/tmp` prints the current statement and `OK`, writes nothing (`git -C /data status --short` empty).
4. Ledger and memory updated; the owner runs «سیاهه → برگه» through the bot.

---

## Self-review

- **Spec coverage:** §2 (verb, patch schema, refusals, effects, preview) → T1; §2.4's ledger line and §3 (ledger, writers, pruning, revert) → T2; §3.4 (readers, revoke) → T3; §4 (I8) → T4; §5/§6 (playbook, agent, pins, CLAUDE.md) → T5; §10 (rollout) → T6. §9's ceilings are stated in the refusal messages of T1 and the runbook of T2.
- **Placeholders:** T3's Step 1 carries `...` for the file's own fixture calls with an explicit instruction to copy them from the first 130 lines — the implementer has the file; nothing else is deferred.
- **Type consistency:** `edit(root, fact_id, patch_path, run_dir, preview=False)` in T1, T2 (`ledger.record(root, run_dir, run_ref, entries, force=)`), T5 (the CLI flags); `chat_confirmations.load/confirmed/forget` in T3 only; `_check_table_shape(entry, messages, label)` in T4 only.
