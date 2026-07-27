# Process-level `set_process` delta block — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the chat/AI path edit a process's `name`, `summary`, `idef0` (process-level ICOM) and `kpis` in place, through the existing `merge update` CLI — closing the gap where only the UI could change these fields.

**Architecture:** Add one **optional** top-level block, `set_process`, to `delta.schema.json`, and apply it in `build_update()` with overwrite semantics (the same semantics `revise_nodes` already uses for node fields). No new CLI verb, no new file, no change to `process.schema.json`. `merge` stays the single writer for the engine path.

**Tech Stack:** Python 3.12, JSON Schema draft 2020-12, pytest.

## Global Constraints

- **DO NOT COMMIT ANYTHING.** The user is making other changes in a separate session (there is an active worktree at `.claude/worktrees/feat-department-export/`). Leave every change uncommitted in the working tree and do not touch that worktree.
- The block is named **`set_process`** — *not* `process`. A bare top-level `process` key collides conceptually with `add_subprocesses[].process` and has already confused the agents once (the delta-wording fix in `e38df0a`).
- `set_process` is **optional** — it must NOT be added to the schema's `required` array. Every existing delta must stay valid (`test_delta_still_valid_without_new_fields` must keep passing).
- The stored process field for the title is **`name`**. `process_name` is the *candidate* field name only (`$defs/candidateNoSub`) — do not use it here.
- Reuse the existing `#/$defs/icom` and `#/$defs/kpi` in `delta.schema.json`; do not redefine them.
- Run the suite with `make test` (`pytest -q`) from the repo root.

## File Structure

| File | Change |
|---|---|
| `schemas/delta.schema.json` | Add the optional `set_process` property (~10 lines) |
| `engine/merge/__init__.py` | Apply it in `build_update()` (2 lines) |
| `engine/tests/test_merge_edit_ops.py` | Add schema + behaviour tests (the precedent file for the last delta extension) |
| `<data-repo>/.claude/skills/edit-process/SKILL.md` | Teach the chat path to use it, with the INV-5 gate |
| `<data-repo>/.claude/agents/extract.md` | Forbid it in voice runs (see Decision 2) |

## Design decisions (confirm before executing)

**Decision 1 — overwrite, not enrich-with-pending.** `enrich_nodes` fills only empty fields and queues conflicts into `process["pending"]`; `revise_nodes` overwrites outright. `set_process` follows **`revise_nodes`**, because `pending`'s schema *requires* a `node` field — a process-level conflict literally cannot be represented there without also changing `process.schema.json`. INV-5 ("human approval before overwriting a filled value") is satisfied one level up: the user is the one asking for the edit in chat, and the skill gate in Task 3 makes that explicit.

**Decision 2 — `edit-process` may emit it; `extract` may not.** If `extract` could emit `set_process`, a routine voice run could silently rename a human-curated process title. Keeping it out of the voice pipeline preserves today's separation: voice runs describe *steps* (nodes/edges), humans curate *identity*. The engine does not enforce this — it is a prompt-level rule (Task 3).

**Decision 3 — no process-level provenance field.** Process `source` is `{type, ref, run}` with `additionalProperties: false` and has no `touched_by` array, so an edit cannot be stamped there without a `process.schema.json` change. Provenance comes from `updated_at` (already set by `build_update`) plus the `chat-edit({id}): …` git commit `edit-process` already makes. Out of scope.

---

### Task 1: Schema — add the optional `set_process` block

**Files:**
- Modify: `schemas/delta.schema.json`
- Test: `engine/tests/test_merge_edit_ops.py`

**Interfaces:**
- Produces: a delta may carry `set_process: {name?, summary?, idef0?, kpis?}`, at least one key, no unknown keys.

- [ ] **Step 1: Write the failing schema tests**

Append to `engine/tests/test_merge_edit_ops.py`, directly after `test_revise_nodes_requires_id_and_set` (i.e. before the `from merge import apply_delta` line):

```python
def test_delta_accepts_set_process():
    validate("delta.schema.json", _empty_delta(
        set_process={"name": "خرید و تدارکات", "summary": "خلاصهٔ تازه."}))


def test_set_process_rejects_unknown_field():
    with pytest.raises(ValueError):
        validate("delta.schema.json", _empty_delta(set_process={"title": "x"}))


def test_set_process_rejects_empty_object():
    with pytest.raises(ValueError):
        validate("delta.schema.json", _empty_delta(set_process={}))


def test_set_process_rejects_malformed_idef0():
    # icom requires all four arrays
    with pytest.raises(ValueError):
        validate("delta.schema.json", _empty_delta(set_process={"idef0": {"inputs": []}}))
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd engine && ../.venv/bin/pytest tests/test_merge_edit_ops.py -q -k set_process`
(If that venv path differs, use `make test` from the repo root and filter by name.)
Expected: `test_delta_accepts_set_process` FAILS — the schema has `additionalProperties: false`, so `set_process` is rejected today.

- [ ] **Step 3: Add the property to the schema**

In `schemas/delta.schema.json`, inside `"properties"`, immediately after the `"revise_nodes"` block (which ends at the `}` on the line before `"$defs"`), add a comma and:

```json
    "set_process": {
      "type": "object",
      "additionalProperties": false,
      "minProperties": 1,
      "properties": {
        "name": { "type": "string" },
        "summary": { "type": "string" },
        "idef0": { "$ref": "#/$defs/icom" },
        "kpis": { "type": "array", "items": { "$ref": "#/$defs/kpi" } }
      }
    }
```

Do **not** touch the `"required"` array.

- [ ] **Step 4: Run the tests — all four pass**

Run: same command as Step 2.
Expected: 4 passed. Also confirm `test_delta_still_valid_without_new_fields` still passes.

---

### Task 2: Engine — apply `set_process` in `build_update`

**Files:**
- Modify: `engine/merge/__init__.py`
- Test: `engine/tests/test_merge_edit_ops.py`

**Interfaces:**
- Consumes: the validated `set_process` object from Task 1.
- Produces: `apply_delta(process, delta, run, now)` overwrites the named process-level fields.

- [ ] **Step 1: Write the failing behaviour tests**

Append to the end of `engine/tests/test_merge_edit_ops.py`:

```python
def test_set_process_overwrites_name_and_summary():
    p = _proc()
    assert p["name"] == "خرید و پرداخت هزینه"          # filled
    apply_delta(p, _empty_delta(set_process={
        "name": "خرید و تدارکات", "summary": "خلاصهٔ بازنویسی‌شده."}), RUN, NOW)
    assert p["name"] == "خرید و تدارکات"
    assert p["summary"] == "خلاصهٔ بازنویسی‌شده."
    validate("process.schema.json", p)
    assert p["updated_at"] == NOW


def test_set_process_replaces_idef0_and_kpis():
    p = _proc()
    icom = {"inputs": ["درخواست"], "controls": [], "outputs": ["کالا"], "mechanisms": []}
    kpis = [{"name": "زمان چرخه", "target": "۲ روز"}]
    apply_delta(p, _empty_delta(set_process={"idef0": icom, "kpis": kpis}), RUN, NOW)
    assert p["idef0"] == icom
    assert p["kpis"] == kpis
    validate("process.schema.json", p)


def test_set_process_absent_leaves_process_fields_untouched():
    p = _proc()
    before = (p["name"], p["summary"], copy.deepcopy(p["idef0"]), copy.deepcopy(p["kpis"]))
    apply_delta(p, _empty_delta(), RUN, NOW)
    assert (p["name"], p["summary"], p["idef0"], p["kpis"]) == before


def test_set_process_does_not_create_pending_rows():
    p = _proc()
    p["pending"] = []
    apply_delta(p, _empty_delta(set_process={"name": "نام تازه"}), RUN, NOW)
    assert p["pending"] == []          # overwrite semantics, not enrich
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd engine && ../.venv/bin/pytest tests/test_merge_edit_ops.py -q -k set_process`
Expected: the first two FAIL with an assertion error (the fields are unchanged — nothing applies the block yet). `test_set_process_absent_…` and `…_does_not_create_pending_rows` may already pass; that is fine, they are regression guards.

- [ ] **Step 3: Apply the block in `build_update`**

In `engine/merge/__init__.py`, inside `build_update`, insert immediately **before** the line `process["updated_at"] = now`:

```python
    for field, val in delta.get("set_process", {}).items():
        process[field] = val
```

Placement note: it must land before the final `validate("process.schema.json", process)` so a malformed value is caught by that validation too.

- [ ] **Step 4: Run the tests — all pass**

Run: same command as Step 2.
Expected: all `set_process` tests pass.

- [ ] **Step 5: Run the whole suite for regressions**

Run: `make test`
Expected: no new failures. Pay particular attention to `test_merge_delta.py`, `test_merge_cli.py`, and `test_merge_edit_ops.py`.

---

### Task 3: Prompts — teach the chat path, fence off the voice path

**Files:**
- Modify: `<data-repo>/.claude/skills/edit-process/SKILL.md`
- Modify: `<data-repo>/.claude/agents/extract.md`

- [ ] **Step 1: Add the capability to `edit-process/SKILL.md`**

In the section that lists what a chat edit can do (alongside the existing delta operations), add:

```markdown
**Editing the process's own fields (title, summary, ICOM, KPIs).** A delta may carry a
`set_process` block to change the process's identity fields in place — no new id, no
tombstone:

    { "add_nodes": [], "add_edges": [], "enrich_nodes": [], "flag_removed": [],
      "set_process": { "name": "…", "summary": "…" } }

Allowed keys: `name` (the title), `summary`, `idef0` (the process-level ICOM, all four
lists required), `kpis`. At least one key. Apply with the normal
`merge update --process {id} --delta {file} --run {run}`.

`set_process` **overwrites** — it never queues a `pending` row. So INV-5 applies to you,
not the engine: before overwriting a field that already has a value, show the user the
current value and the proposed one and get an explicit approval. Only then run `merge`.
```

- [ ] **Step 2: Fence it off in `extract.md`**

In `extract.md`, in the delta-mode section that enumerates the allowed delta keys, add:

```markdown
**Never emit `set_process`.** It exists for chat-driven edits only. A voice run
describes *steps* (nodes and edges); a process's title, summary, ICOM and KPIs are
human-curated, and a routine re-run must not silently rename them.
```

- [ ] **Step 3: Verify nothing else claims the delta key set is closed**

Run: `grep -rn "add_nodes\|revise_nodes" <data-repo>/.claude/ | grep -v set_process`
Review each hit: if a file enumerates the delta's allowed keys as exhaustive, it needs the same update. Report what you find rather than editing blindly.

---

### Task 4: Verification (no commit)

- [ ] **Step 1: Full suite green**

Run: `make test` — expected: all pass.

- [ ] **Step 2: End-to-end smoke against a scratch DATA_ROOT**

Do NOT run this against the real `data-repo`. Use a temp copy:

```bash
TMP=$(mktemp -d); export DATA_ROOT=$TMP
mkdir -p "$TMP/departments/cooking/processes" "$TMP/runs"
cp tests/fixtures/process.cooking-001.json "$TMP/departments/cooking/processes/cooking-001.json"
cat > "$TMP/d.json" <<'JSON'
{"add_nodes": [], "add_edges": [], "enrich_nodes": [], "flag_removed": [],
 "set_process": {"name": "خرید و تدارکات"}}
JSON
merge update --process cooking-001 --delta "$TMP/d.json" --run runs/smoke
python3 -c "import json;print(json.load(open('$TMP/departments/cooking/processes/cooking-001.json'))['name'])"
```
Expected: prints `خرید و تدارکات`.

- [ ] **Step 3: Report, do not commit**

Leave everything uncommitted. Summarise for the user: files changed, tests added, suite result. Explicitly confirm no `git commit` was run and the `feat-department-export` worktree was untouched.

---

## Out of scope (call out, don't build)

- Routing process-level conflicts into `pending` — needs a `process.schema.json` change (`pending` requires `node`).
- A process-level `touched_by` provenance array — same reason (Decision 3).
- Reconciling data-repo `CLAUDE.md`'s "written **only** by the `merge` CLI" rule with the UI's direct-write path. That statement is already inaccurate today; this change does not make it worse, but it is worth a separate ADR.
