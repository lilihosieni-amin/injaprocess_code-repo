# Facts Tables-as-the-Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove item entries and every reference to them, and give every rule, measurement and note a `home` table so a table's page lists what belongs to it, unattached entries stay visible, and a person can move an entry between tables through the agent.

**Architecture:** The store keeps one file per kind and one id per entry; a new envelope member `home` (`{"ref": "F-…", "field"?}`, record-only) is added to rules, measurements and notes and indexed in `.index.json`. The assembly resolves `home` like any reference and derives it from `applies_to`/`of`/`about` when a unit wrote none; the ladder never lets a run overwrite a stored `home` (it notes the disagreement and the report names it); `merge facts edit` sets/unsets `home`; the panel reads the index to list a record's subsets and shows a home link on entry pages; the `edit-fact` playbook gains move/detach. The `item` kind, `itemData`, `refItems`, item candidates/units/cards/filters are deleted.

**Tech Stack:** Python 3.12 engine (pytest), JSON Schema draft 2020-12, React + TypeScript + Vite (vitest), FastAPI backend, data-repo Markdown playbooks with a pytest lint.

**Spec:** `docs/superpowers/specs/2026-09-16-facts-tables-as-the-spine-design.md` (owner decisions §7 dated 2026-09-16).

## Global Constraints

- **Four kinds:** `record`, `measurement`, `rule`, `note`. No `item` kind, no `itemData`, no `refItems` column type, no `facts/items.json`; `of`/`per` name a record (+field/row) or are text.
- **`home`** on rule/measurement/note only: the store's `ref` shape (`{"ref", "field"?}`), target a **record**; `null`/absent = unattached; records never carry `home`. `.index.json` rows carry `home` (record id or null).
- **Tiers stand** (2026-09-13): a `home` that names no record is **severed with a note** (C29), never refused; an `edit set home` naming a non-record or no entry is refused with one line (R3). A run never overwrites a stored `home`: the disagreement becomes a note on the entry and a line in `report.md` (owner decision 1).
- **Ticks per entry, unchanged.** Moving an entry does not reset its tick; a content change does. A record's tick covers the record only.
- **Panel:** facts list pages unchanged (unattached entries stay there — owner decision 2); a record's page gains three subset sections with per-entry ticks and counts; entry pages show «جدول: …» or «بدون جدول»; one batch-confirm button that calls the existing per-entry confirm endpoint once per entry; no move action in the UI.
- **Persian for anything a person reads**; English only in logs, stderr, validator lines and keys.
- **Determinism:** same inputs → byte-identical outputs; derivation of `home` is a pure function of the entry.
- **Git:** each track commits only its own files, by path, on its own branch; never `git add -A`; never push; never `main` of either repo; never the server; never the data-repo's `facts/`, `runs/`, `meetings/`, `departments/`, `attachments/`.
- **Tests:** scoped while iterating, the track's full suite once before its final commit; in a worktree `PYTHONPATH="$WT/engine:$WT/ui-backend" "$MAIN/.venv/bin/pytest" -q …`; UI: `ui/node_modules` symlinked to MAIN's, `./node_modules/.bin/vitest run`, `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`.
- **Parallel cap: 4 agents.** Implementers on Opus, task reviewers on Sonnet, final review on Opus.

## File ownership

| Track | Branch (from `main`) | Owns |
|---|---|---|
| S store | `tas-store` | `schemas/facts.schema.json`, `schemas/facts-delta.schema.json`, `schemas/facts-unit.schema.json`, `engine/merge_facts/*`, `engine/merge/cli.py`, `engine/tests/test_facts_schema.py`, `engine/tests/test_merge_facts_*.py`, `engine/tests/test_store_tiers.py`, `engine/tests/test_content_tiers.py` |
| P planner+assembly | `tas-planner` | `engine/facts_plan/*`, `engine/facts_plan/cards/*`, `engine/tests/test_facts_plan_*.py`, `engine/tests/test_unit_gate_tiers.py`, `engine/tests/test_facts_evidence_types.py`, `engine/tests/test_facts_acceptance.py`, `engine/tests/fixtures/**` |
| U panel | `tas-ui` | `ui/src/**`, `ui-backend/**` |
| D playbook | data-repo `tas` | `.claude/agents/quantify.md`, `.claude/skills/quantify/SKILL.md`, `.claude/skills/edit-fact/SKILL.md`, `.claude/hooks/test_playbook_lint.py` |
| E docs | `tas-docs` | `docs/runbooks/07-facts.md`, `docs/guides/quantitative-facts-walkthrough.md`, `docs/decisions/0017-facts-pipeline-v3.md` |

S ∥ P ∥ U ∥ D run first (cap 4), E after any of them frees a slot; I and F after all. Shared test helper `engine/tests/facts_helpers.py` and `engine/tests/test_common.py` are frozen during the parallel phase; a track that needs a change adds it in its own file and reports it for Task I.

---

### Task S: The store — schemas, kind files, `home` in the ladder and in `edit`

**Files:**
- Modify: the three schemas; `engine/merge_facts/__init__.py` (kind files, `.index.json` writer, `iter_ref_objects` — already walks `home`), `ladder.py` (`TOP_SKIP` `:49`), `verbs.py` (forbidden heads `:283`, `edit` ops), `apply.py` (delta gate), `preconditions.py`/`content.py` (refItems rows removed), `audit.py`, `engine/merge/cli.py` (`lint_failures` gone already; kind list)
- Test: `engine/tests/test_facts_schema.py`, `engine/tests/test_merge_facts_ladder.py`, `engine/tests/test_merge_facts_verbs.py`, `engine/tests/test_merge_facts_apply.py`, `engine/tests/test_store_tiers.py`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `KINDS = ("record", "measurement", "rule", "note")` (exported from `merge_facts`), `KIND_FILES` without `items.json`.
  - schema: `home` on `rule`/`measurement`/`note` envelopes: `{"anyOf": [{"$ref": "#/$defs/homeRef"}, {"type": "null"}]}`, `homeRef = {ref: F-/T- id, field?: mintedKey}`; `record` envelope forbids `home`; kind enum `["record","measurement","rule","note"]`; `itemData`, `refItems` removed; `recordField.type` enum without `refItems`; the unit schema's decision/`new[]` shapes accept `home` (`{"ref": "S-…|N-…|F-…", "field"?}`) and lose `item`.
  - index row: `"home": "F-00025" | null` (the record id; the field is not indexed).
  - `ladder.merge_home(existing, incoming) -> str | None`: when both have a home and they differ, the stored one stays and the function returns the incoming record id (the caller adds the note `{"kind": "shape", "description": "این اجرا این مورد را زیر جدول دیگری می‌دید."}` → no: use kind `placement` — see below); when the stored entry has no home and the incoming has one, it is adopted (`union`).
  - `apply` writes `{run_dir}/moved-home.json`: `[{"id": "F-00116", "title": "…", "stored": "F-00025", "seen": "F-00031"}]` (the record ids), for `report`.
  - `edit`: ops `{"op": "set", "path": "home", "value": {"ref": "F-00025", "field"?}}` and `{"op": "unset", "path": "home"}`; `set` on a record kind, or with a target that is not a record or does not exist → refusal line `home: F-00025 is not a record` / `home: F-09999 names no entry`.
  - issue kind enum gains `placement` (the note the ladder writes; Persian description above).

- [ ] **Step 1: Failing schema tests** (`engine/tests/test_facts_schema.py`, append)

```python
def test_the_store_has_four_kinds_and_no_item():
    assert not validates("facts", entry(kind="item", data={"category": "ingredient", "unit": "kg"}))
    assert set(KINDS) == {"record", "measurement", "rule", "note"}


def test_a_refitems_column_is_gone_and_text_takes_its_place():
    rec = entry(kind="record", data={"medium": "sheet", "fields": [{"key": "qalam", "title": "قلم", "type": "refItems", "refItems": {"namespace": "##"}}]})
    assert not validates("facts", rec)
    rec["data"]["fields"][0] = {"key": "qalam", "title": "قلم", "type": "text"}
    assert validates("facts", rec)


def test_home_is_a_record_ref_on_rules_measurements_and_notes_and_never_on_a_record():
    for kind in ("rule", "measurement", "note"):
        assert validates("facts", entry(kind=kind, home={"ref": "F-00025"}))
        assert validates("facts", entry(kind=kind, home={"ref": "F-00025", "field": "vazn"}))
        assert validates("facts", entry(kind=kind, home=None))
        assert not validates("facts", entry(kind=kind, home={"ref": "F-00025", "row": "r1"}))
    assert not validates("facts", entry(kind="record", home={"ref": "F-00025"}))


def test_the_index_row_carries_the_home_record_id(tmp_path):
    store = seeded_store(tmp_path, [entry(kind="record", id="F-00025"), entry(kind="rule", id="F-00030", home={"ref": "F-00025", "field": "vazn"})])
    row = next(r for r in read_json(store / ".index.json")["entries"] if r["id"] == "F-00030")
    assert row["home"] == "F-00025"
```

`validates`, `entry`, `seeded_store` are the module's existing helpers (read the file first; use its names and say which in the report).

- [ ] **Step 2: Run → FAIL.** `PYTHONPATH=… pytest -q engine/tests/test_facts_schema.py -k "four_kinds or refitems or home_is or index_row"`.

- [ ] **Step 3: Schemas and kind files.** In `facts.schema.json`: `homeRef` def; `home` on the three envelopes via `allOf` branches per kind (the file already branches per kind at `:386`); kind enum; delete `itemData`, `refItems`, the `item` branch; `recordField.type` without `refItems`; issue kind enum + `placement`. Same in the delta schema; in the unit schema drop the `item` decision shape and add `home` (`S-/N-/F-` ref) on decisions and `new[]`. In `merge_facts/__init__.py`: `KINDS`, `KIND_FILES`, index writer adds `"home": (e.get("home") or {}).get("ref")`.

- [ ] **Step 4: Run Step 1 → PASS. Commit** `feat(facts): four kinds and a home — the store contract without items` — by path.

- [ ] **Step 5: Failing ladder / apply / edit tests**

```python
# test_merge_facts_ladder.py
def test_a_run_never_moves_an_entry_a_person_placed():
    existing = {"kind": "rule", "home": {"ref": "F-00025"}, "statement": "x", "data": {}}
    incoming = {"kind": "rule", "home": {"ref": "F-00031"}, "statement": "x", "data": {}}
    assert merge_home(existing, incoming) == "F-00031"
    assert existing["home"] == {"ref": "F-00025"}
    assert {"kind": "placement", "description": PLACEMENT_FA, "affects": []} in existing["issues"]


def test_an_unplaced_entry_adopts_the_runs_home():
    existing = {"kind": "rule", "home": None, "statement": "x", "data": {}}
    assert merge_home(existing, {"kind": "rule", "home": {"ref": "F-00031"}}) is None
    assert existing["home"] == {"ref": "F-00031"}

# test_merge_facts_apply.py
def test_apply_records_the_homes_it_did_not_move(tmp_path, capsys):
    root, run = store_with(tmp_path, [record("F-00025"), record("F-00031"), rule("F-00116", home="F-00025")])
    apply(root, run, delta_with([rule_delta(key="saqf", home="F-00031")]))   # same key → merges into F-00116
    moved = read_json(run / "moved-home.json")
    assert moved == [{"id": "F-00116", "title": "سقف ضایعات", "stored": "F-00025", "seen": "F-00031"}]
    assert read_entry(root, "F-00116")["home"] == {"ref": "F-00025"}


def test_a_delta_that_still_carries_an_item_is_refused_with_one_line(tmp_path, capsys):
    rc = apply(root, run, delta_with([{"kind": "item", "key": "kahu", "title": "کاهو", "data": {"category": "ingredient", "unit": "kg"}}]))
    assert rc == 2 and "item" in capsys.readouterr().err.splitlines()[-1]


def test_a_home_that_names_no_record_is_severed_with_a_note(tmp_path):
    entry = apply_one(root, run, rule_delta(key="saqf", home="T-99"))      # T-99 exists in no delta and no store
    assert entry["home"] is None and any(i["kind"] == "shape" for i in entry["issues"])

# test_merge_facts_verbs.py
def test_edit_moves_an_entry_and_keeps_its_tick_and_history(tmp_path):
    root = store_with(tmp_path, [record("F-00025"), record("F-00031"), rule("F-00116", home="F-00025", confirmed=True)])
    edit(root, "F-00116", [{"op": "set", "path": "home", "value": {"ref": "F-00031"}}], run_dir)
    e = read_entry(root, "F-00116")
    assert e["home"] == {"ref": "F-00031"} and confirmed(root, "F-00116")
    assert e["updated_at"] > before


def test_edit_detaches_and_refuses_a_home_that_is_not_a_record(tmp_path, capsys):
    edit(root, "F-00116", [{"op": "unset", "path": "home"}], run_dir); assert read_entry(root, "F-00116")["home"] is None
    assert edit(root, "F-00116", [{"op": "set", "path": "home", "value": {"ref": "F-00116"}}], run_dir) == 2
    assert "home: F-00116 is not a record" in capsys.readouterr().err
```

Use the modules' existing store/delta helpers (`facts_helpers.py` is frozen — wrap it in the test module where a shape is missing).

- [ ] **Step 6: Run → FAIL. Implement.**

```python
# ladder.py
PLACEMENT_FA = "این اجرا این مورد را زیر جدول دیگری می‌دید؛ جای ثبت‌شده تغییر نکرد."

def merge_home(existing, incoming):
    """Owner decision 1 (2026-09-16): `home` is placement, not a fact. A stored
    home is never overwritten by a run — the run's view becomes a `placement`
    issue and is returned for the report; an unplaced entry adopts the run's."""
    mine, theirs = existing.get("home"), incoming.get("home")
    if not theirs or theirs == mine:
        return None
    if not mine:
        existing["home"] = copy.deepcopy(theirs)
        return None
    issue = {"kind": "placement", "description": PLACEMENT_FA, "affects": []}
    issues = existing.setdefault("issues", [])
    if issue not in issues:
        issues.append(issue)
    return theirs["ref"]
```

`TOP_SKIP` gains `"home"`; `merge_entry` calls `merge_home` after `merge_extra` and records `("home", "union")` when adopted. `apply` collects `(id, title, stored, seen)` for every non-None return into `moved-home.json` (written every run, `[]` when empty, deterministic order by id). The delta gate refuses kind `item` with the line `facts: kind item is no longer stored (spec 2026-09-16)` on stderr, exit 2, before anything is written. `preconditions.reference_findings` already severs a dangling `home` because `iter_ref_objects` walks it — add the test only; if it does not, extend `_ref_sites`. `verbs.edit`: `home` leaves the forbidden-heads list for the three kinds; a `set` validates target kind by reading the store index (`home: <id> is not a record` / `names no entry`), on a record kind `home: a table has no home`.

- [ ] **Step 7: Remove `refItems` and items** from `preconditions.py`, `content.py`, `audit.py` (rows that mention `refItems`, `##` namespaces, `ITEM` kinds), `export`/`retire`/`check` over `KINDS`. Delete the item-specific tests; keep behaviour tests that only used an item as a sample by switching the sample to a measurement.

- [ ] **Step 8: Run** `test_merge_facts_*.py`, `test_store_tiers.py`, `test_content_tiers.py`, `test_facts_schema.py`, then the whole engine suite (expect failures only in Track P/U files that still mention items — list them in the report, do not edit them). **Commit** `feat(facts): a run never moves a placed entry; edit moves it; no item rows anywhere in the store` — by path.

---

### Task P: The planner and the assembly — no items, `home` derived and resolved, report by table

**Files:**
- Modify: `engine/facts_plan/build.py` (`item_candidates` `:686`, `u-items` in `plan_units` `:1688`, `_code_slug`, `reuse_slice`/`recorded_slice` item lines, `KIND_DATA`/`KIND_FA`/`WRITABLE_KINDS` `:1894-1906`, `EXAMPLES`, cards), `engine/facts_plan/assemble.py` (`KIND_ORDER`, `_resolve_refs` `:1870`, `_entry`, `_cross_unit`/flags, `_digest_text`, `report` `:2833`), `engine/facts_plan/preflight.py`, `engine/facts_plan/cards/*.md`
- Test: `engine/tests/test_facts_plan_*.py`, `engine/tests/test_unit_gate_tiers.py`, fixtures (`expected.json`, the prep-run fixture's `expected` counts)

**Interfaces:**
- Consumes: Task S's `KINDS`, `home` shapes, `moved-home.json` (`[{"id","title","stored","seen"}]`).
- Produces:
  - `derive_home(entry) -> dict | None` (pure): rule with `applies_to` on exactly one record → `{"ref": that}`; measurement whose `data.of` names a record → `{"ref": of.ref, "field": of.field}` when it has one; note whose `data.about` names one or more records → the **first** record it names (owner decision 3); otherwise `None`. A unit-written `home` wins over derivation.
  - `_resolve_refs` rewrites `home` (temp ids, renamed fields) as any ref; a `home` naming a dropped/failed candidate is cleared to `None` with a shape note (not held back).
  - digest flag `{"code": "homeless", "id": "T-…", "candidates": ["T-…"]}` for a rule/measurement with no home whose title shares ≥ 2 tokens (`_tokens`) with a record's title/aliases; the reviewer's `keep` may set `home`.
  - `report.md`: after the losses block, a **by-table block**: one line per record with counts (`«فرم تبدیل آماده‌سازی برگر»: ۸ قاعده، ۳ اندازه‌گیری، ۱ یادداشت`), then `بدون جدول: ۱۲ قاعده، ۴ اندازه‌گیری، ۲ یادداشت` (omitted when zero), then one line per `moved-home.json` row: `جای «سقف ضایعات» تغییر نکرد؛ این اجرا آن را زیر «فرم تولید نیمه‌ساخته» می‌دید.` Titles come from the store/delta, never ids.

- [ ] **Step 1: Failing tests**

```python
# test_facts_plan_assemble.py
def test_home_is_derived_from_bindings_of_and_about():
    assert derive_home({"kind": "rule", "data": {"applies_to": [{"key": "a", "record": {"ref": "T-3"}}]}}) == {"ref": "T-3"}
    assert derive_home({"kind": "rule", "data": {"applies_to": [{"key": "a", "record": {"ref": "T-3"}}, {"key": "b", "record": {"ref": "T-4"}}]}}) is None
    assert derive_home({"kind": "measurement", "data": {"of": {"ref": "T-3", "field": "vazn"}}}) == {"ref": "T-3", "field": "vazn"}
    assert derive_home({"kind": "note", "data": {"about": [{"ref": "T-3"}]}}) == {"ref": "T-3"}
    assert derive_home({"kind": "note", "data": {"about": [{"ref": "T-3"}, {"ref": "T-4"}]}}) == {"ref": "T-3"}   # owner decision 3: the first it names
    assert derive_home({"kind": "rule", "home": {"ref": "T-9"}, "data": {"applies_to": [{"key": "a", "record": {"ref": "T-3"}}]}}) == {"ref": "T-9"}


def test_a_units_home_resolves_through_temp_ids_and_renamed_fields(tmp_path):
    root, run = _two_unit_run(tmp_path, att_new=[FORM], tr_new=[dict(RULE, home={"ref": "N-u-att-1-0", "field": "vazn"})])
    assemble(root, run)
    d = read_json(run / "facts-delta.json"); form = by_key(d, "form_tahvil"); rule = by_key(d, "saqf")
    assert rule["home"] == {"ref": form["id"], "field": "vazn"}


def test_a_home_naming_a_dropped_candidate_is_cleared_with_a_note_not_held(tmp_path):
    root, run = _two_unit_run(tmp_path, att_new=[FORM], tr_new=[dict(RULE, home={"ref": "N-u-att-1-0"})])
    drop_new(run, "u-att-1", 0)                      # the photo unit's form is dropped by the review
    assemble(root, run, review=True)
    a = read_json(run / "assembly.json"); d = read_json(run / "facts-delta.json")
    rule = by_key(d, "saqf")
    assert rule["home"] is None and any(i["kind"] == "shape" for i in rule["issues"])
    assert not [u for u in a["undecided"] if u.get("label") == RULE["title"]]


def test_the_digest_flags_a_homeless_rule_beside_a_matching_table(tmp_path):
    text = digest_text_for(records=[("form_burger", "فرم تبدیل آماده‌سازی برگر")], rules=[("saqf_burger", "سقف ضایعات برگر", None)])
    assert "homeless · " in text and "form_burger" in text.split("homeless")[1][:120]

# test_facts_plan_report.py
def test_the_report_groups_by_table_then_the_unattached_then_the_unmoved(tmp_path):
    text = report_for(tmp_path, delta=[record("F-00025", "فرم تبدیل آماده‌سازی برگر"), rule(home="F-00025"), rule(home=None)],
                      moved=[{"id": "F-00116", "title": "سقف ضایعات", "stored": "F-00025", "seen": "F-00031"}], titles={"F-00031": "فرم تولید نیمه‌ساخته"})
    assert "«فرم تبدیل آماده‌سازی برگر»: ۱ قاعده" in text
    assert "بدون جدول: ۱ قاعده" in text
    assert "جای «سقف ضایعات» تغییر نکرد؛ این اجرا آن را زیر «فرم تولید نیمه‌ساخته» می‌دید." in text
    assert not re.search(r"F-\d{5}|T-\d+", text)

# test_facts_plan_build.py
def test_no_item_unit_is_planned_and_the_coded_tab_is_still_a_record(tmp_path):
    root = make_estate(tmp_path)               # the module's estate builder (cooking has ## codes)
    build(root, "cooking", tmp_path / "run", [])
    plan = read_json(tmp_path / "run" / "plan.json")
    assert not [u for u in plan["units"] if u["type"] == "items"]
    sk = read_json(tmp_path / "run" / "skeleton.json")
    assert not [c for c in sk["candidates"] if c["kind"] == "item"]
    assert [c for c in sk["candidates"] if c["kind"] == "record" and c["payload"].get("rows")]   # the coded tab, rows kept
```

- [ ] **Step 2: Run → FAIL. Implement.** Delete `item_candidates`, the `u-items` unit and its split axis, `ITEM_PARAM`, the item lines of `reuse_slice`/`recorded_slice` (`item_units`), `KIND_*` item rows, the item example and card text; `PHASE_OF` loses `items`. In `assemble.py`: `KIND_ORDER` without item; `_entry` sets `entry["home"] = written.get("home") or derive_home(entry)` for the three kinds (records: no key); `_resolve_refs` covers `home` (verify `iter_ref_objects` walks it; a `home` to a dropped candidate → `None` + shape note instead of the hold-back branch); `_cross_unit` adds `homeless` flags; `_digest_text` prints them and each entry's home handle; `report()` adds the by-table block (`_by_table_block(delta, store_titles)`) and reads `moved-home.json` when present. `preflight` and the generality property lose item expectations; refresh the frozen fixtures (`expected.json` counts, the prep-run fixture's expected undecided/handles).

- [ ] **Step 3: Run** the planner and assembly suites, then the whole engine suite (Track S's tests may fail before integration — list, do not edit). **Commit** `feat(facts): every rule, measurement and note has a home; the report reads by table; no item candidates` — by path.

---

### Task U: The panel — no items, subsets on a table's page, home on entry pages, batch confirm

**Files:**
- Modify: `ui/src/facts/cards/RecordCard.tsx` (after `:87`), `ui/src/facts/FactDetail.tsx` (`:170`), `ui/src/facts/FactsList*.tsx`, `ui/src/facts/factsFilter.ts`, `ui/src/facts/bundle.ts`, `ui/src/facts/factsLabels.ts`, `ui/src/facts/types.ts`; delete `ui/src/facts/cards/ItemCard.tsx` + test; `ui-backend/inja_ui_backend/facts_store.py` (`:137` kind files, `:332` item code index, index passthrough)
- Test: vitest files beside each component; `ui-backend/tests/test_facts_*.py`

**Interfaces:**
- Consumes: index rows with `home` (Task S); the existing per-entry confirm endpoint; entry `home` on rule/measurement/note.
- Produces:
  - `types.ts`: `kind: 'record' | 'measurement' | 'rule' | 'note'`; `home?: {ref: string; field?: string} | null`; index row `home: string | null`.
  - `RecordCard` renders three sections from the index: `«قواعد این جدول»`, `«اندازه‌گیری‌های این جدول»`, `«یادداشت‌های این جدول»` — rows: title, confirm state, `home.field` title when set (looked up in the record's fields); header `«N از M تأیید شده»`; empty section omitted. Notes: also those whose `about` names the record and whose `home` is empty.
  - `FactDetail` shows `«جدول: <title>»` (a link opening the record) or `«بدون جدول»` on rule/measurement/note pages; a retired home → `«جدول بازنشسته»`.
  - Button `«تأیید همهٔ موارد این جدول»` on `RecordCard`: for each unconfirmed subset entry, `POST` the existing confirm endpoint once, sequentially; the record's own tick untouched; disabled when nothing is unconfirmed; errors reported per entry in the panel's existing toast.
  - Facts list pages unchanged (owner decision 2): no item kind in filters/labels; nothing else.

- [ ] **Step 1: Failing vitest** — `RecordCard.test.tsx`: renders the three sections from a bundle whose index holds two rules (one confirmed) and one note about the record → headers `«قواعد این جدول — ۱ از ۲ تأیید شده»`, the note listed, empty measurements section absent; clicking a row calls `onOpen(id)`; the batch button posts once per unconfirmed entry (mock fetch, assert call count and ids) and never for the record itself. `FactDetail.test.tsx`: a rule with `home` shows the record's title and opens it; `home: null` shows «بدون جدول»; a home whose record is retired shows «جدول بازنشسته». `factsFilter.test.ts`: no `item` kind. `ItemCard.test.tsx` deleted.
- [ ] **Step 2: Run → FAIL. Implement** (labels in Persian in `factsLabels.ts`; look-ups by id through the bundle's index; no new endpoint).
- [ ] **Step 3: ui-backend:** four kind files, index passthrough of `home`, item code index removed, tests updated (`ui-backend/tests`). Run `./node_modules/.bin/vitest run src/facts`, `tsc --noEmit`, `npm run build`, and the ui-backend suite. **Commit** `feat(panel): a table's page lists its rules, measurements and notes; entries show their table; no item card` — by path.

---

### Task D: Agent text and playbooks

**Files:** data-repo `.claude/agents/quantify.md`, `.claude/skills/quantify/SKILL.md`, `.claude/skills/edit-fact/SKILL.md` (Step 3 case table `:92`, usage examples `:323`), `.claude/hooks/test_playbook_lint.py`

- [ ] **Step 1: Failing pins** — `test_the_agent_has_no_item_mode_and_the_playbook_no_item_vocabulary` (no `item` mode heading, no «قلم» in the classification table, no `refItems`); `test_every_rule_measurement_and_note_names_its_home` (verbatim: «every rule, measurement or note you write names its `home` — the listed table it is about or written on, by its printed handle — and leaves it empty only when no listed table fits»); `test_review_mode_may_set_a_home_on_a_homeless_flag`; `test_edit_fact_has_move_and_detach_cases` (the two new rows of the case table and the example «قاعدهٔ «سقف ضایعات» را زیر «فرم تبدیل آماده‌سازی برگر» ببر»).
- [ ] **Step 2: Write the text.** `quantify.md`: remove the item mode, the item rows of the classification table, item examples; add the `home` rule to the unit contract (shape `{"ref": "<handle>", "field"?}`; a measurement that is a column of a listed form → `home.field`, not a new table); review mode: the `homeless` flag and `keep` with `home`. `SKILL.md`: the report now leads by table (nothing else changes). `edit-fact/SKILL.md`: two rows — **move** (resolve the entry and the target table by title/alias/id in the index; refuse to guess between two matches — lettered choices; plan line «قاعدهٔ «…» زیر «…» می‌رود.»; apply `set home`) and **detach** («… از جدولش جدا می‌شود.»; `unset home`); usage examples; the owner-facing lines carry no ids.
- [ ] **Step 3:** `"$MAIN/.venv/bin/pytest" -q .claude/hooks` → pass. **Commit** by path: `quantify(playbook): every fact names its table; edit-fact moves and detaches; no items`.

---

### Task E: Docs

- [ ] Runbook 07 (§12: four kinds, `home`, the placement rule, `moved-home.json`, the by-table report, edit move/detach), the walkthrough (no items; table pages), ADR 0017 ruling paragraph dated 2026-09-16 quoting the owner («Items, and any reference that was made to items, should be removed», the process engineer's feedback, the three decisions). Commit by path: `docs(facts): tables as the spine`.

---

### Task I: Integration

- [ ] Merge `tas-store`, `tas-planner`, `tas-ui`, `tas-docs` into `tas-int` (`--no-ff`); a textual conflict means a track broke ownership — stop and report. Fix cross-track tests (tests in one track's files that still expect items or lack `home`), `facts_helpers.py`/`test_common.py` changes the tracks reported. Whole engine suite, `make test`, ui-backend, vitest, tsc, build → pass. Real-run check: re-assemble the 2026-09-15 local run (`data-local-fau`, `runs/facts/preparation/20260915-111116`) with the new engine → every rule/measurement/note has a derived home or is unattached; print the by-table counts; the delta carries no item (the run's item unit outputs are ignored with one stderr line, not a crash).

### Task F: Final review and local run

- [ ] Opus whole-branch review against the spec (every §3/§4 rule, the three decisions, tiers, determinism, INV-3); one fix wave; scoped re-review.
- [ ] Local run of preparation on the throwaway data branch (`local-test-fau`: reset the store to the seed, delete `facts/items.json` and the item ids from `.index.json`, check out the `tas` playbook), headless as before. **Success:** no item unit; every rule/measurement/note in the delta has a home or is listed under «بدون جدول» in the report; the throwaway panel (port 8002, rebuilt UI) shows a table's page with its subsets and ticks; a chat move through `edit-fact` moves one rule and keeps its tick.
- [ ] Report to the owner. Nothing pushed; the server untouched; store cleanups (laptop main, server) only on the owner's word.
