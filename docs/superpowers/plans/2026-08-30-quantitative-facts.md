# Quantitative Facts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the quantitative-facts store (five kinds, one global file per kind), its engine verbs (`merge facts`, `dump-workbook`, `allocate-id fact`, the `extract-attachment` dispatcher), the `quantify`/`edit-fact` playbooks, the ui-backend facts routes with per-entry confirmation, and the Panel «داده‌های کمّی» section built exactly to `ui/design/Inja Panel.dc.html`.

**Architecture:** Everything under `data-repo/facts/` is written by one writer, `merge facts`, invoked from three callers (the facts run, `edit-fact`, the ui-backend) that each record a run directory under `runs/facts/{dept}/{stamp}/`. The ui-backend serves entries with three lookup maps (`resolved`, `row_titles`, `path_labels`) so no bare key ever reaches a screen, and reuses the existing confirmation table with a facts canonicaliser. The UI is one new Panel section whose design of record is the facts part of `ui/design/Inja Panel.dc.html`.

**Tech Stack:** Python 3 (stdlib + jsonschema, python-docx, optional `google-genai` extra) for engine and FastAPI ui-backend; JSON Schema draft 2020-12; React + TypeScript + Vite for the UI; Playwright for UI end-to-end tests; pytest for everything Python.

**Spec:** `docs/superpowers/specs/2026-08-29-quantitative-facts-design.md` (v2, QF-1…QF-45). The plan argues from the spec; executors read both. Where this plan and the spec disagree, the spec wins; where either disagrees with the UI design of record, see the DESIGN LAW below.

## Global Constraints

- **DESIGN LAW (user directive, verbatim intent):** the UI must fully match the facts section of `ui/design/Inja Panel.dc.html` — layout, spacing, colors, wording, section order, interactions — **no exceptions**, corrected only by the ten "Design conformance notes" at the end of spec §14. If a task in this plan (or the spec) requires any UI element that is **missing from the design** — a screen, a control, a state, a label with no designed home — **STOP and ask the user before implementing that part**. Never invent UI. The reverse is not true: anything present in the design is implemented without asking.
- **Playwright is the UI test runner** for the facts screens: every UI task's acceptance is a Playwright test run against the app, plus the repo's existing unit-test conventions.
- Two repos: `code-repo` (this repo: engine, schemas, ui-backend, ui, docs) and its sibling `data-repo` (`../data-repo`: playbooks, agents, guard, the store itself). Tasks name their repo explicitly. Both are git repos; commit in the repo you touched.
- `facts/**` in data-repo is written **only** by `merge facts` (QF-2). No test, script or route writes those files directly — tests go through the verb.
- Engine CLI contract: deterministic, `DATA_ROOT`-relative, exit `0` success, exit `2` failed precondition **with nothing written**, exit `3` (extract-attachment only) advisory skips. Writes use `engine_common.write_json_atomic` / `write_text_atomic`.
- Schemas: JSON Schema draft 2020-12, `"$id"` = bare filename, **no cross-file `$ref`** (self-contained files, local `#/$defs/...` only), dropped into `code-repo/schemas/` (auto-discovered by `engine_common.validate` from `SCHEMA_DIR`).
- Keys: minted segments match `^[a-z][a-z0-9]*(_[a-z0-9]+)*$`; `__` is reserved as the join operator; no Persian keys anywhere (QF-32). Ids: facts are `^F-[0-9]{5}$`, temp ids `^T-[0-9]+$`.
- Jalali business dates are Latin-digit `YYYY-MM-DD` or `YYYY-MM` (QF-41); `updated_at` and run stamps are ISO-8601 UTC.
- UI text: everything shown is Persian from `ui/src/lib/factsLabels.ts` (spec Appendix D) and the served maps; numeric values/codes/keys/formulas are LTR islands in Latin digits; every numeric input passes `toLatinDigits` before the API (QF-42).
- Model ids are env pins, never literals: `VERTEX_VISION_MODEL` (new) beside `GEMINI_MODEL` (transcription).
- Test runs are **scoped** (the user's standing rule): run the test file(s) named by the step, never the whole `make test` sweep, e.g. `.venv/bin/pytest engine/tests/test_merge_facts_apply.py -q` from the repo root.
- Commits: one per task minimum, message prefixed `feat(facts):` / `test(facts):` / `docs(facts):`; in data-repo the same discipline with its own git history. Never `git add -A` in data-repo — use explicit paths.

## File structure (locked here)

**Phase 1 — engine + schemas (code-repo)**

| Path | Responsibility |
|---|---|
| `schemas/facts.schema.json` | store file wrapper + envelope + five payloads + shared `{ref}` def |
| `schemas/facts-delta.schema.json` | the agent's/edit output — temp ids, no derived fields |
| `schemas/facts-index.schema.json` | `.index.json` rows with `field_status_counts` |
| `schemas/facts-idseq.schema.json` | `{"fact": n}` |
| `schemas/facts-run-meta.schema.json` | facts run `meta.json` |
| `schemas/manifest.schema.json` | `attachments/sheets/manifest.json` |
| `schemas/manifest-proposal.schema.json` | `quantify` manifest-mode output |
| `engine/allocate_id/` (modify) | `fact` subcommand, global ledger `facts/.id-seq.json` |
| `engine/merge_facts/__init__.py` | store I/O, natural keys, write ladder, status derivation |
| `engine/merge_facts/apply.py` | the `apply` verb |
| `engine/merge_facts/verbs.py` | `resolve`, `retire`, `promote`, `export`, `revert` |
| `engine/merge_facts/audit.py` | `audit`, `check` |
| `engine/merge_facts/content.py` | the `validate facts` content pass (expr tokeniser, unit edges, …) |
| `engine/merge/cli.py` (modify) | `facts` subcommand tree dispatching to `merge_facts`; tombstone `facts:` lines in `remove`/`restructure` |
| `engine/dump_workbook/{cli.py,__init__.py,README.md}` | the workbook dumper, `--init-manifest` / `--manifest` |
| `engine/extract_attachment/` (modify) | extension dispatcher, `--path`, hash cache, Vertex vision, exit 3 |
| `engine/transcribe/__init__.py` (reuse) | Vertex client pattern for the vision call |
| `engine/tests/test_{merge_facts_*,dump_workbook,extract_attachment_dispatch,allocate_id_fact,validate_facts}.py` | per-task tests |
| `tests/test_facts_schema.py`, `tests/fixtures/facts/*.json` | schema conformance fixtures |

**Phase 2 — runtime (data-repo, plus docs in code-repo)**

| Path | Responsibility |
|---|---|
| `../data-repo/.claude/hooks/guard.py` (modify) + `test_guard.py` | `FACTS_REL_RE`, `FACTS_CMD_RE` |
| `../data-repo/.claude/agents/quantify.md` | the quantify agent (modes `manifest`/`full`/`targeted`) |
| `../data-repo/.claude/skills/quantify/SKILL.md` | the facts playbook (stages 0, M, set, A, 1–7, B, C) |
| `../data-repo/.claude/skills/edit-fact/SKILL.md` | targeted chat edits |
| `../data-repo/.claude/skills/process-voice/SKILL.md` (modify, Stage 9) | one relay sentence |
| `../data-repo/.claude/skills/edit-process/SKILL.md` (modify, Step 6) | one relay sentence |
| `../data-repo/CLAUDE.md`, `../data-repo/.gitignore` (modify) | `facts/**` hard rule; `attachments/sheets/**/*.xlsx` |
| `docs/runbooks/07-facts.md` (new) | bootstrap order, units seed, universal confirmations, handover |
| `config/engine.env.example`, `deploy/docker-compose*.yml`, `engine/README.md`, `schemas/README.md`, `ARD.md`, `PRD.md`, `CLAUDE.md` (modify) | env pin, docs rows |

**Phase 3 — ui-backend (code-repo)**

| Path | Responsibility |
|---|---|
| `ui-backend/inja_ui_backend/facts_store.py` | read `facts/*.json` + index; build `resolved`/`row_titles`/`path_labels`; red paths; coverage |
| `ui-backend/inja_ui_backend/routers/facts.py` | list, get, branches, reverse index, resolve (write), source download |
| `ui-backend/inja_ui_backend/fingerprint.py` (modify) | `fact_fingerprint` — exclusion `{updated_at}` at envelope level only |
| `ui-backend/inja_ui_backend/routers/confirmations.py` (modify) | `_kind` fact, fact loader, red-409 |
| `ui-backend/inja_ui_backend/access.py` (modify) | fact scope helper (no per-miss audit rows) |
| `ui-backend/inja_ui_backend/visibility.py`, `disclosure.py` (modify) | fact branch in `filtered`; `may_serve` per entry |
| `ui-backend/inja_ui_backend/store/policy.py` (modify) | six `fact_*` switches (6 → 12 rows) |
| `ui-backend/inja_ui_backend/store/manifest.py` | manifest reader (branches, coverage denominator) |
| `ui-backend/inja_ui_backend/db.py` (modify) | migration: `data_repo_commit` column on `confirmations` |
| `ui-backend/tests/test_facts_*.py`, `test_endpoint_matrix.py`, `test_policy_store.py` (modify) | route matrix + behaviour |

**Phase 4 — ui (code-repo)** — files fixed after the design-of-record audit in Task 20; the section lives under `ui/src/facts/` with `ui/src/lib/factsLabels.ts`, Playwright specs under `ui/e2e/` (exact filenames set in Phase 4's tasks).

## Execution order

Phases run 1 → 2 → 3 → 4; within a phase, tasks run in the order written (later tasks import earlier ones' functions by the exact names in their **Interfaces** blocks). Phase 4 must not start before Phase 3's routes exist — its Playwright tests run against the real backend on a fixture `DATA_ROOT`.

---
# Phase 1 — Engine and schemas (code-repo)

### Task 1: Facts schemas and fixtures

**Files:**
- Create: `schemas/facts.schema.json`, `schemas/facts-delta.schema.json`, `schemas/facts-index.schema.json`, `schemas/facts-idseq.schema.json`, `schemas/facts-run-meta.schema.json`, `schemas/manifest.schema.json`, `schemas/manifest-proposal.schema.json`
- Create: `tests/fixtures/facts/entry-item.json`, `entry-record.json`, `entry-measurement.json`, `entry-rule.json`, `entry-note.json`, `delta-min.json`
- Modify: `schemas/README.md` (one row per new schema; the QF-41 date convention note; the QF-45 `schema_version` migration note)
- Test: `tests/test_facts_schema.py`

**Interfaces:**
- Consumes: `engine_common.validate(schema_name, instance)` (raises `ValueError` on mismatch), `SCHEMA_DIR` auto-discovery — no registration needed (`engine/engine_common/__init__.py:66-76`).
- Produces: the seven schema files, resolvable by name (`validate("facts", f)` works because of the name-normalisation at `engine/validate/cli.py:12`). Every later task validates against these.

Read first: `tests/test_segments_schema.py` and `tests/conftest.py:20-31` — mirror the existing `validate` fixture call signature exactly (adapt the test code below if it differs).

- [ ] **Step 1: Write the failing test**

`tests/test_facts_schema.py` (fixtures are JSON files under `tests/fixtures/facts/`; the entry fixtures are the five §7 examples from the spec — copy the §6 envelope example verbatim as `entry-rule.json`, and build the other four from the §7 payload examples wrapped in the same envelope shape with their own ids/keys/kinds; `delta-min.json` is `entry-rule.json` with `id: "T-1"`, no `status`/`updated_at`, no `source[].hash`/`source[].run`, no `accounts[].id`, and `data.original` instead of `data.original_ref`):

```python
import copy, json, pathlib, pytest

FIX = pathlib.Path(__file__).parent / "fixtures" / "facts"

def _load(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))

def _wrap(*entries):
    return {"schema_version": 1, "entries": list(entries)}

KINDS = ["item", "record", "measurement", "rule", "note"]

def test_one_valid_fixture_per_kind_validates(validate):
    for kind in KINDS:
        validate("facts.schema.json", _wrap(_load(f"entry-{kind}.json")))

def test_unknown_envelope_key_fails(validate):
    e = _load("entry-item.json"); e["provenance"] = "x"
    with pytest.raises(ValueError):
        validate("facts.schema.json", _wrap(e))

def test_wrong_kind_payload_fails_on_required(validate):
    e = _load("entry-item.json"); e["kind"] = "rule"   # item payload lacks inputs/outputs
    with pytest.raises(ValueError):
        validate("facts.schema.json", _wrap(e))

def test_unknown_data_key_passes(validate):
    e = _load("entry-item.json"); e["data"]["future_field"] = {"anything": 1}
    validate("facts.schema.json", _wrap(e))

def test_persian_key_fails(validate):
    e = _load("entry-item.json"); e["key"] = "پنیر"
    with pytest.raises(ValueError):
        validate("facts.schema.json", _wrap(e))

def test_doubled_underscore_minted_segment_fails(validate):
    e = _load("entry-item.json"); e["key"] = "bad___key"
    with pytest.raises(ValueError):
        validate("facts.schema.json", _wrap(e))

def test_bare_string_reference_fails(validate):
    e = _load("entry-measurement.json"); e["data"]["of"] = "F-00003"
    with pytest.raises(ValueError):
        validate("facts.schema.json", _wrap(e))

def test_ref_object_with_foreign_key_fails(validate):
    e = _load("entry-measurement.json"); e["data"]["of"] = {"ref": "F-00003", "note": "x"}
    with pytest.raises(ValueError):
        validate("facts.schema.json", _wrap(e))

def test_delta_carrying_status_or_hash_fails(validate):
    d = _load("delta-min.json")
    bad = copy.deepcopy(d); bad["status"] = "confirmed"
    with pytest.raises(ValueError):
        validate("facts-delta.schema.json", _wrap(bad))
    bad = copy.deepcopy(d); bad["source"][0]["hash"] = "sha256:" + "0" * 64
    with pytest.raises(ValueError):
        validate("facts-delta.schema.json", _wrap(bad))

def test_delta_minimum_validates(validate):
    validate("facts-delta.schema.json", _wrap(_load("delta-min.json")))

def test_idseq_and_index_and_run_meta(validate):
    validate("facts-idseq.schema.json", {"fact": 42})
    validate("facts-run-meta.schema.json", {
        "department": "cooking", "origin": "pipeline", "actor": "operator",
        "started_at": "2026-09-01T10:15:00Z", "finished_at": None,
        "recordings": [], "attachments": [], "workbooks": [],
        "delta": "runs/facts/cooking/20260901-101500/facts-delta.json",
        "merged": False, "ids_created": []})

def test_manifest_short_pattern_and_confirmed(validate):
    m = {"schema_version": 1,
         "branches": [{"code": "chalebagh", "name": "چاله‌باغ"}],
         "workbooks": [{"spreadsheetId": "1abc", "dir": "D", "file": "F.xlsx",
                        "short": "gozaresh_cb", "scripts": [],
                        "departments": ["management"], "branches": ["chalebagh"],
                        "reference_tabs": [], "confirmed": True}]}
    validate("manifest.schema.json", m)
    m["workbooks"][0]["short"] = "Bad Short"
    with pytest.raises(ValueError):
        validate("manifest.schema.json", m)

def test_bad_jalali_date_fails(validate):
    e = _load("entry-rule.json"); e["valid_from"] = "1404/09/01"
    with pytest.raises(ValueError):
        validate("facts.schema.json", _wrap(e))
```

- [ ] **Step 2: Run it — expect failure**

Run: `.venv/bin/pytest tests/test_facts_schema.py -q` (from repo root)
Expected: every test errors with `unknown schema 'facts.schema.json'` (the `ValueError` from `engine_common.validate`).

- [ ] **Step 3: Write the schemas**

`schemas/facts.schema.json` — the complete contract. House rules: draft 2020-12, `$id` = filename, self-contained (no cross-file `$ref`), kind discriminated with `oneOf` + `const`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "facts.schema.json",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "entries"],
  "properties": {
    "schema_version": { "const": 1 },
    "entries": { "type": "array", "items": { "$ref": "#/$defs/entry" } }
  },
  "$defs": {
    "mintedKey": { "type": "string",
      "pattern": "^[a-z][a-z0-9]*(_[a-z0-9]+)*(__[a-z][a-z0-9]*(_[a-z0-9]+)*)*$" },
    "factId": { "type": "string", "pattern": "^F-[0-9]{5}$" },
    "jalali": { "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}(-[0-9]{2})?$" },
    "iso": { "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$" },
    "ref": { "type": "object", "additionalProperties": false,
      "required": ["ref"],
      "properties": {
        "ref": { "type": "string", "pattern": "^(F-[0-9]{5}|T-[0-9]+)$" },
        "field": { "$ref": "#/$defs/mintedKey" },
        "row": { "$ref": "#/$defs/mintedKey" } } },
    "refOrNull": { "oneOf": [{ "$ref": "#/$defs/ref" }, { "type": "null" }] },
    "procRef": { "type": "object", "additionalProperties": false,
      "required": ["ref"],
      "properties": { "ref": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" } } },
    "scope": { "type": "object", "additionalProperties": false,
      "properties": {
        "departments": { "type": "array", "items": { "type": "string", "pattern": "^[a-z]+$" } },
        "branches":    { "type": "array", "items": { "type": "string", "pattern": "^[a-z]+$" } } } },
    "sourceLoc": { "type": "object", "additionalProperties": false,
      "required": ["type", "ref"],
      "properties": {
        "type": { "enum": ["sheet", "script", "comment", "validation", "cf",
                            "photo", "pdf", "docx", "voice", "process", "chat"] },
        "ref": { "type": ["string", "null"] },
        "sheet": { "type": "string" }, "cell": { "type": "string" },
        "lines": { "type": "string", "pattern": "^[0-9]+(-[0-9]+)?$" },
        "page": { "type": "integer" }, "function": { "type": "string" },
        "node": { "type": "string" }, "quote": { "type": "string" } } },
    "source": { "allOf": [{ "$ref": "#/$defs/sourceLoc" }],
      "type": "object",
      "properties": {
        "hash": { "type": ["string", "null"], "pattern": "^sha256:[0-9a-f]{64}$" },
        "run": { "type": "string" } } },
    "account": { "type": "object", "additionalProperties": false,
      "required": ["id", "field", "statement", "source", "status"],
      "properties": {
        "id": { "type": "string", "pattern": "^[0-9a-f]{8}$" },
        "field": { "type": "string" },
        "statement": { "type": "string" },
        "value": {}, "unit": { "type": "string" },
        "source": { "$ref": "#/$defs/sourceLoc" },
        "speaker_role": { "type": ["string", "null"] },
        "status": { "enum": ["open", "chosen", "rejected"] } } },
    "issue": { "type": "object", "additionalProperties": false,
      "required": ["kind", "description", "affects"],
      "properties": {
        "kind": { "enum": ["scale", "unit_kind", "column_shift", "junk", "bug",
                            "cross_record", "code_collision"] },
        "from_date": { "$ref": "#/$defs/jalali" }, "to_date": { "$ref": "#/$defs/jalali" },
        "field": { "type": "string" }, "description": { "type": "string" },
        "fix": { "type": "object", "additionalProperties": false,
          "required": ["op"],
          "properties": { "op": { "enum": ["multiply", "divide", "shift_columns", "ignore"] },
                          "factor": { "type": "number" } },
          "if": { "properties": { "op": { "enum": ["multiply", "divide"] } } },
          "then": { "required": ["op", "factor"] } },
        "affects": { "type": "array", "items": { "$ref": "#/$defs/ref" } } } },
    "envelope": { "type": "object", "additionalProperties": false,
      "required": ["id", "kind", "key", "title", "statement", "scope", "source",
                   "status", "retired", "updated_at", "data"],
      "properties": {
        "id": { "$ref": "#/$defs/factId" },
        "kind": { "enum": ["item", "record", "measurement", "rule", "note"] },
        "key": { "$ref": "#/$defs/mintedKey" },
        "title": { "type": "string" },
        "aliases": { "type": "array", "items": { "type": "string" } },
        "statement": { "type": "string" },
        "scope": { "$ref": "#/$defs/scope" },
        "source": { "type": "array", "items": { "$ref": "#/$defs/source" } },
        "status": { "enum": ["confirmed", "inferred", "informal", "disputed", "unknown"] },
        "field_status": { "type": "object",
          "additionalProperties": { "enum": ["inferred", "informal"] } },
        "accounts": { "type": "array", "items": { "$ref": "#/$defs/account" } },
        "valid_from": { "oneOf": [{ "$ref": "#/$defs/jalali" }, { "type": "null" }] },
        "valid_to": { "oneOf": [{ "$ref": "#/$defs/jalali" }, { "type": "null" }] },
        "supersedes": { "$ref": "#/$defs/refOrNull" },
        "superseded_by": { "$ref": "#/$defs/refOrNull" },
        "retired": { "type": "boolean" },
        "issues": { "type": "array", "items": { "$ref": "#/$defs/issue" } },
        "processes": { "type": "array", "items": { "$ref": "#/$defs/procRef" } },
        "updated_at": { "$ref": "#/$defs/iso" },
        "data": { "type": "object" } } },
    "entry": { "allOf": [
        { "$ref": "#/$defs/envelope" },
        { "oneOf": [
          { "properties": { "kind": { "const": "item" },
              "data": { "type": "object", "required": ["category", "unit"] } } },
          { "properties": { "kind": { "const": "record" },
              "data": { "type": "object", "required": ["medium", "role", "location"] } } },
          { "properties": { "kind": { "const": "measurement" },
              "data": { "type": "object", "required": ["quantity", "unit"] } } },
          { "properties": { "kind": { "const": "rule" },
              "data": { "type": "object", "required": ["inputs", "outputs"] } } },
          { "properties": { "kind": { "const": "note" },
              "data": { "type": "object" } } } ] } ] }
  }
}
```

`schemas/facts-delta.schema.json`: copy the whole `$defs` block from `facts.schema.json` into it (self-contained rule), then apply exactly these differences:
- `$id`: `"facts-delta.schema.json"`.
- In `envelope`: `id` pattern becomes `^T-[0-9]+$` and `id` is **removed from `required`** (an entry matched by natural key carries none); `required` drops `status` and `updated_at`; add `"status": false, "updated_at": false` is not legal JSON Schema — instead **remove** `status`/`updated_at` from `properties` (with `additionalProperties: false` their presence then fails).
- In `source`: remove `hash` and `run` from `properties`.
- In `account`: remove `id` from `properties` and from `required`.
- The `data` payloads may carry `"original"` (admitted automatically — payloads are open) and must not carry `original_ref`: add to `entry`'s `allOf` a third member `{ "properties": { "data": { "not": { "required": ["original_ref"] } } } }`.

`schemas/facts-index.schema.json` — array wrapper `{schema_version, entries[]}` where each row requires `id, kind, key, title, scope, status, retired, updated_at` and admits `aliases`, `valid_to`, `processes` (array of process-id strings), `field_status_counts` (object with integer `disputed`, `unknown`, `informal`, `inferred`), `stub` (boolean). Reuse the same `$defs` patterns (copy `factId`, `mintedKey`, `scope`, `iso`).

`schemas/facts-idseq.schema.json`:

```json
{ "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "facts-idseq.schema.json",
  "type": "object", "additionalProperties": false,
  "required": ["fact"],
  "properties": { "fact": { "type": "integer", "minimum": 0 } } }
```

`schemas/facts-run-meta.schema.json` — object, `additionalProperties: false`, required `department, origin, actor, started_at, finished_at, recordings, attachments, workbooks, delta, merged, ids_created`; `origin` enum `pipeline|chat|ui`; `finished_at` nullable ISO; `recordings`/`attachments`/`workbooks`/`ids_created` string arrays; optional `instruction` (string — the `edit-fact` chat instruction).

`schemas/manifest.schema.json` — object `{schema_version: const 1, branches[], workbooks[]}`; branch rows `{code (pattern ^[a-z]+$), name}`; workbook rows require `spreadsheetId, dir, file, short, scripts, departments, branches, reference_tabs, confirmed`, `short` pattern `^[a-z][a-z0-9]*(_[a-z0-9]+)*$`, `confirmed` boolean; add `"uniqueItems": true`-style uniqueness for `short` via a top-level note in `schemas/README.md` (JSON Schema cannot assert cross-row uniqueness — `merge facts`/`dump-workbook` enforce it, Task 5/10).

`schemas/manifest-proposal.schema.json` — object keyed by `spreadsheetId` → `{departments, branches, reference_tabs, reasons}` where each of the three lists admits the literal `"?"` in place of a value and `reasons` is an object mapping each proposed value to a one-line string.

- [ ] **Step 4: Write the six fixtures** (spec §6 envelope example verbatim → `entry-rule.json`; §7 payloads wrapped for the other kinds; `delta-min.json` per Step 1's description), then run: `.venv/bin/pytest tests/test_facts_schema.py -q` — Expected: PASS. Also run `.venv/bin/pytest tests/test_all_schemas_selfvalid.py -q` — the new schemas are auto-discovered and must be self-valid.

- [ ] **Step 5: Update `schemas/README.md`** — one row per new schema in the index table; a "Dates" note (QF-41: business validity is Latin-digit Jalali `YYYY-MM-DD`/`YYYY-MM`, `updated_at`/run stamps ISO-8601 UTC — this amends the previous "Jalali is UI-only" line); a "schema_version migration" note (QF-45: bump only with an append-only migration note here; readers refuse higher versions).

- [ ] **Step 6: Commit**

```bash
git add schemas/ tests/test_facts_schema.py tests/fixtures/facts/
git commit -m "feat(facts): facts store schemas, delta, index, manifest + fixtures"
```

### Task 2: `allocate-id fact` — the global ledger

**Files:**
- Modify: `engine/allocate_id/__init__.py`, `engine/allocate_id/cli.py`, `engine/allocate_id/README.md`
- Test: `engine/tests/test_allocate_id_fact.py`

**Interfaces:**
- Consumes: `engine_common.data_root()`, existing `_read_ledger` idiom (`engine/allocate_id/__init__.py:11-17`).
- Produces: `peek_fact_id(root=None) -> str` and `next_fact_id(root=None) -> str` returning `"F-00001"`-style ids; ledger file `facts/.id-seq.json` `{"fact": n}`; CLI `allocate-id fact [--peek]`. Task 5's `apply` calls `next_fact_id` once per key-miss.

- [ ] **Step 1: Write the failing test**

```python
import json
from allocate_id import next_fact_id, peek_fact_id

def test_first_fact_id_and_ledger(tmp_path):
    (tmp_path / "facts").mkdir()
    assert peek_fact_id(root=tmp_path) == "F-00001"
    assert next_fact_id(root=tmp_path) == "F-00001"
    assert json.loads((tmp_path / "facts" / ".id-seq.json").read_text()) == {"fact": 1}
    assert next_fact_id(root=tmp_path) == "F-00002"

def test_ledger_survives_a_department_allocation(tmp_path):
    """QF-21: the fact counter is global and disjoint from department ledgers."""
    from allocate_id import next_process_id
    (tmp_path / "facts").mkdir()
    (tmp_path / "departments" / "cooking" / "processes").mkdir(parents=True)
    assert next_fact_id(root=tmp_path) == "F-00001"
    next_process_id("cooking", root=tmp_path)
    assert next_fact_id(root=tmp_path) == "F-00002"

def test_missing_facts_dir_is_created(tmp_path):
    assert next_fact_id(root=tmp_path) == "F-00001"
    assert (tmp_path / "facts" / ".id-seq.json").exists()

def test_peek_does_not_persist(tmp_path):
    peek_fact_id(root=tmp_path)
    assert not (tmp_path / "facts" / ".id-seq.json").exists()
```

- [ ] **Step 2: Run** `.venv/bin/pytest engine/tests/test_allocate_id_fact.py -q` — Expected: FAIL, `ImportError: cannot import name 'next_fact_id'`.

- [ ] **Step 3: Implement** in `engine/allocate_id/__init__.py`:

```python
def _fact_ledger_path(root):
    return root / "facts" / ".id-seq.json"

def _read_fact_ledger(root):
    p = _fact_ledger_path(root)
    try:
        return int(json.loads(p.read_text(encoding="utf-8")).get("fact", 0))
    except (OSError, ValueError):
        return 0

def peek_fact_id(root=None):
    root = pathlib.Path(root) if root else data_root()
    return f"F-{_read_fact_ledger(root) + 1:05d}"

def next_fact_id(root=None):
    root = pathlib.Path(root) if root else data_root()
    nxt = _read_fact_ledger(root) + 1
    p = _fact_ledger_path(root)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"fact": nxt}) + "\n", encoding="utf-8")
    return f"F-{nxt:05d}"
```

CLI (`engine/allocate_id/cli.py`): add a `fact` subparser with `--peek`, dispatching to the two functions and printing the id — mirror the `process` arm exactly. `README.md`: document the global ledger (and fix the stale "no counter file" line while in the file).

- [ ] **Step 4: Run** `.venv/bin/pytest engine/tests/test_allocate_id_fact.py engine/tests/test_allocate_id.py -q` — Expected: PASS (old suite untouched).

- [ ] **Step 5: Commit** — `git add engine/allocate_id engine/tests/test_allocate_id_fact.py && git commit -m "feat(facts): allocate-id fact with global facts ledger"`

### Task 3: `merge_facts` core — store I/O, natural keys, status derivation, path grammar

**Files:**
- Create: `engine/merge_facts/__init__.py`
- Modify: `engine/pyproject.toml` (add `merge_facts*` to the packages-find include list)
- Test: `engine/tests/test_merge_facts_core.py`

**Interfaces:**
- Consumes: `engine_common.read_json`, `write_json_atomic`, `validate`.
- Produces (exact names later tasks import):
  - `KIND_FILES: dict[str, str]` (`item→items.json, record→records.json, measurement→measurements.json, rule→rules.json, note→notes.json`), `KIND_ORDER = ["item","record","measurement","rule","note"]`
  - `load_store(root) -> dict[str, dict]` — kind → `{"schema_version": 1, "entries": [...]}` (missing file → empty wrapper)
  - `save_store(root, store) -> None` — validates each file against `facts.schema.json`, writes the five files and `facts/.index.json` atomically
  - `canonical_scope(scope) -> dict`, `is_open(entry) -> bool`, `find_match(store, entry) -> entry | None`
  - `derive_status(entry) -> str`, `null_paths(entry) -> list[str]`, `field_status_counts(entry) -> dict`
  - `get_path(entry, path)`, `path_exists(entry, path) -> bool` (QF-7 grammar: `/`-joined; keyed arrays addressed by member `key`)
  - `account_id(field, statement, value, source) -> str` (first 8 hex of sha256 over `field|statement|value|source.ref|locator`)
  - `build_index(store) -> dict`, `sha256_file(path) -> str` (returns `"sha256:<hex>"`), `iter_ref_objects(obj)` (yields every nested dict whose keys ⊆ `{ref, field, row}` and contain `ref`)

- [ ] **Step 1: Write the failing test**

```python
import json
from merge_facts import (KIND_FILES, KIND_ORDER, account_id, build_index,
                         canonical_scope, derive_status, find_match, get_path,
                         is_open, iter_ref_objects, load_store, null_paths,
                         path_exists, save_store)

def _entry(**over):
    e = {"id": "F-00001", "kind": "rule", "key": "k1", "title": "t",
         "statement": "s", "scope": {"departments": [], "branches": []},
         "source": [], "status": "confirmed", "retired": False,
         "updated_at": "2026-09-01T10:00:00Z",
         "data": {"inputs": [], "outputs": [{"key": "v", "title": "و", "unit": "g",
                                             "nature": "limit", "value": 5}]}}
    e.update(over)
    return e

def test_canonical_scope_sorts_and_dedups():
    assert canonical_scope({"departments": ["b", "a", "a"]}) == \
        {"departments": ["a", "b"], "branches": []}

def test_status_ladder_order():
    e = _entry()
    assert derive_status(e) == "confirmed"
    e["field_status"] = {"data/outputs/v/value": "inferred"}
    assert derive_status(e) == "inferred"
    e["field_status"] = {"data/outputs/v/value": "informal"}
    assert derive_status(e) == "informal"
    e["data"]["outputs"][0]["value"] = None
    assert derive_status(e) == "unknown"
    e["accounts"] = [{"id": "00000000", "field": "data/expr", "statement": "x",
                      "source": {"type": "chat", "ref": None}, "status": "open"}]
    assert derive_status(e) == "disputed"          # disputed wins over unknown

def test_null_paths_walks_keyed_arrays_and_rows():
    e = _entry(kind="record", data={
        "medium": "paper", "role": "log", "location": {"path": "p"},
        "fields": [{"key": "start_stock", "title": "م", "type": "number", "unit": None}],
        "rows": [{"key": "burger", "title": "برگر", "grams": None}]})
    assert set(null_paths(e)) == {"data/fields/start_stock/unit",
                                  "data/rows/burger/grams"}

def test_omitted_key_is_not_a_null_path():
    e = _entry()          # no 'identifier', no 'valid_to' inside data
    assert null_paths(e) == []

def test_path_grammar():
    e = _entry(kind="record", data={"medium": "sheet", "role": "reference",
        "location": {}, "fields": [{"key": "grams", "title": "گرم", "unit": "g"}],
        "rows": [{"key": "prod_61__ing_1", "grams": 250}]})
    assert get_path(e, "data/rows/prod_61__ing_1/grams") == 250
    assert path_exists(e, "data/fields/grams/unit")
    assert not path_exists(e, "data/fields/nope/unit")

def test_find_match_prefers_sheet_identity_then_natural_key():
    store = {k: {"schema_version": 1, "entries": []} for k in KIND_ORDER}
    a = _entry(kind="record", key="old_key",
               data={"medium": "sheet", "role": "reference",
                     "location": {"spreadsheetId": "S1", "sheet": "پیتزا"}})
    store["record"]["entries"].append(a)
    probe = _entry(kind="record", key="renamed",
                   data={"medium": "sheet", "role": "reference",
                         "location": {"spreadsheetId": "S1", "sheet": "پیتزا"}})
    assert find_match(store, probe) is a          # matched by (spreadsheetId, sheet)
    b = _entry(kind="rule", key="k1")
    store["rule"]["entries"].append(b)
    assert find_match(store, _entry(kind="rule", key="k1")) is b
    closed = _entry(kind="rule", key="k2", valid_to="1404-01-01")
    store["rule"]["entries"].append(closed)
    assert find_match(store, _entry(kind="rule", key="k2")) is None   # only open entries

def test_account_id_is_stable_8_hex():
    src = {"type": "sheet", "ref": "a.xlsx", "sheet": "پیتزا", "cell": "H6"}
    a = account_id("data/expr", "=X", "y", src)
    assert a == account_id("data/expr", "=X", "y", src) and len(a) == 8

def test_store_roundtrip_and_index(tmp_path, monkeypatch):
    monkeypatch.setenv("SCHEMA_DIR", str(__import__("pathlib").Path(__file__).resolve().parents[2] / "schemas"))
    store = load_store(tmp_path)                   # all-empty wrappers
    store["rule"]["entries"].append(_entry())
    save_store(tmp_path, store)
    again = load_store(tmp_path)
    assert again["rule"]["entries"][0]["id"] == "F-00001"
    idx = json.loads((tmp_path / "facts" / ".index.json").read_text(encoding="utf-8"))
    row = idx["entries"][0]
    assert row["id"] == "F-00001" and row["kind"] == "rule"
    assert row["field_status_counts"] == {"disputed": 0, "unknown": 0,
                                          "informal": 0, "inferred": 0}

def test_iter_ref_objects_by_shape():
    e = _entry(data={"inputs": [{"key": "a", "title": "آ", "unit": "g",
                                 "from": {"ref": "F-00031", "field": "end_stock"}}],
                     "outputs": [], "calls": [{"ref": "T-2"}]})
    refs = [r["ref"] for r in iter_ref_objects(e)]
    assert refs == ["F-00031", "T-2"]
```

- [ ] **Step 2: Run** `.venv/bin/pytest engine/tests/test_merge_facts_core.py -q` — Expected: FAIL `ModuleNotFoundError: merge_facts`.

- [ ] **Step 3: Implement `engine/merge_facts/__init__.py`**

```python
"""Core helpers for the facts store. merge facts is the ONLY writer (QF-2)."""
import hashlib
import json
import pathlib

from engine_common import read_json, validate, write_json_atomic

KIND_FILES = {"item": "items.json", "record": "records.json",
              "measurement": "measurements.json", "rule": "rules.json",
              "note": "notes.json"}
KIND_ORDER = ["item", "record", "measurement", "rule", "note"]

def facts_dir(root):
    return pathlib.Path(root) / "facts"

def load_store(root):
    out = {}
    for kind, name in KIND_FILES.items():
        p = facts_dir(root) / name
        out[kind] = (read_json(p) if p.exists()
                     else {"schema_version": 1, "entries": []})
    return out

def canonical_scope(scope):
    scope = scope or {}
    return {"departments": sorted(set(scope.get("departments") or [])),
            "branches": sorted(set(scope.get("branches") or []))}

def is_open(entry):
    return not entry.get("retired", False) and entry.get("valid_to") is None

def _sheet_identity(entry):
    loc = (entry.get("data") or {}).get("location") or {}
    if entry.get("kind") == "record" and loc.get("spreadsheetId") and loc.get("sheet"):
        return (loc["spreadsheetId"], loc["sheet"])
    return None

def find_match(store, entry):
    """Sheet records match on (spreadsheetId, sheet) first (QF-15), then the
    natural key (kind, key, canonical scope) among open entries."""
    kind = entry["kind"]
    ident = _sheet_identity(entry)
    if ident:
        for e in store[kind]["entries"]:
            if is_open(e) and _sheet_identity(e) == ident:
                return e
    nk = (entry["key"], json.dumps(canonical_scope(entry.get("scope")), sort_keys=True))
    for e in store[kind]["entries"]:
        if is_open(e) and (e["key"], json.dumps(canonical_scope(e.get("scope")),
                                                sort_keys=True)) == nk:
            return e
    return None

def _walk(value, prefix, out):
    if value is None:
        out.append(prefix)
    elif isinstance(value, dict):
        for k, v in value.items():
            _walk(v, f"{prefix}/{k}", out)
    elif isinstance(value, list):
        for member in value:
            if isinstance(member, dict) and "key" in member:
                _walk({k: v for k, v in member.items() if k != "key"},
                      f"{prefix}/{member['key']}", out)

def null_paths(entry):
    """QF-6: a null leaf inside data is unknown; an absent key is not."""
    out = []
    _walk(entry.get("data") or {}, "data", out)
    return out

def derive_status(entry):
    if any(a.get("status") == "open" for a in entry.get("accounts") or []):
        return "disputed"
    if null_paths(entry):
        return "unknown"
    values = set((entry.get("field_status") or {}).values())
    if "informal" in values:
        return "informal"
    if "inferred" in values:
        return "inferred"
    return "confirmed"

def field_status_counts(entry):
    fs = entry.get("field_status") or {}
    return {"disputed": sum(1 for a in entry.get("accounts") or []
                            if a.get("status") == "open"),
            "unknown": len(null_paths(entry)),
            "informal": sum(1 for v in fs.values() if v == "informal"),
            "inferred": sum(1 for v in fs.values() if v == "inferred")}

def _step(value, seg):
    if isinstance(value, dict):
        return value[seg]
    if isinstance(value, list):
        for member in value:
            if isinstance(member, dict) and member.get("key") == seg:
                return member
    raise KeyError(seg)

def get_path(entry, path):
    value = entry
    for seg in path.split("/"):
        value = _step(value, seg)
    return value

def path_exists(entry, path):
    try:
        get_path(entry, path)
        return True
    except (KeyError, TypeError):
        return False

def account_id(field, statement, value, source):
    locator = source.get("cell") or source.get("lines") or source.get("function") \
        or source.get("node") or (str(source.get("page")) if source.get("page") else "")
    blob = f"{field}|{statement}|{'' if value is None else value}|{source.get('ref') or ''}|{locator}"
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:8]

def build_index(store):
    rows = []
    for kind in KIND_ORDER:
        for e in store[kind]["entries"]:
            rows.append({"id": e["id"], "kind": kind, "key": e["key"],
                         "title": e["title"], "aliases": e.get("aliases") or [],
                         "scope": canonical_scope(e.get("scope")),
                         "status": e["status"],
                         "field_status_counts": field_status_counts(e),
                         "processes": [p["ref"] for p in e.get("processes") or []],
                         "retired": e.get("retired", False),
                         "valid_to": e.get("valid_to"),
                         "stub": bool((e.get("data") or {}).get("stub")),
                         "updated_at": e["updated_at"]})
    return {"schema_version": 1, "entries": rows}

def save_store(root, store):
    for kind, name in KIND_FILES.items():
        validate("facts.schema.json", store[kind])
    for kind, name in KIND_FILES.items():
        write_json_atomic(facts_dir(root) / name, store[kind])
    write_json_atomic(facts_dir(root) / ".index.json", build_index(store))

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 16), b""):
            h.update(block)
    return "sha256:" + h.hexdigest()

def iter_ref_objects(obj):
    """Every nested dict whose keys are a subset of {ref, field, row} with ref
    (QF-37's shape test), in document order."""
    if isinstance(obj, dict):
        if "ref" in obj and set(obj) <= {"ref", "field", "row"}:
            yield obj
        else:
            for v in obj.values():
                yield from iter_ref_objects(v)
    elif isinstance(obj, list):
        for member in obj:
            yield from iter_ref_objects(member)
```

Add `merge_facts*` to the `[tool.setuptools.packages.find] include` list in `engine/pyproject.toml` (beside the existing entries), and check the fixtures you wrote in Task 1 keep `save_store`'s validate call green.

- [ ] **Step 4: Run** `.venv/bin/pytest engine/tests/test_merge_facts_core.py -q` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add engine/merge_facts engine/pyproject.toml engine/tests/test_merge_facts_core.py && git commit -m "feat(facts): merge_facts core — store IO, natural keys, status derivation"`

### Task 4: The write ladder (§11)

**Files:**
- Create: `engine/merge_facts/ladder.py`
- Test: `engine/tests/test_merge_facts_ladder.py`

**Interfaces:**
- Consumes: `merge_facts.account_id`.
- Produces: `merge_entry(existing, incoming, incoming_source) -> list[tuple[str, str]]` — mutates `existing` in place, returns `[(path, action)]` where action ∈ `{"create","fill","noop","dispute","union","append"}`; `incoming_source` is the one `source[]` dict of the incoming delta entry that carries the challenged value (used to materialise the incumbent's account and the challenger's). Constants: `PROSE_LEAVES = frozenset({"statement","grain","method","exceptions","reason","why","description"})`, `UNION_FIELDS`, `DEDUP_KEYS`.

- [ ] **Step 1: Write the failing test**

```python
import copy
from merge_facts.ladder import merge_entry

SRC_A = {"type": "sheet", "ref": "a.xlsx", "sheet": "پیتزا", "cell": "H6"}
SRC_B = {"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "40"}

def _base():
    return {"id": "F-00001", "kind": "rule", "key": "k", "title": "قدیم",
            "statement": "نوشته اول", "scope": {"departments": [], "branches": []},
            "source": [dict(SRC_A)], "status": "confirmed", "retired": False,
            "updated_at": "2026-09-01T10:00:00Z",
            "data": {"inputs": [], "outputs": [{"key": "v", "title": "و",
                     "unit": "g", "nature": "limit", "value": 5}], "expr": None}}

def test_prose_written_once_never_disputed():
    e = _base()
    inc = copy.deepcopy(e); inc["statement"] = "نوشته دوم"
    merge_entry(e, inc, SRC_B)
    assert e["statement"] == "نوشته اول"          # second wording discarded

def test_fill_empty_scalar():
    e = _base(); e["data"]["expr"] = None
    inc = copy.deepcopy(e); inc["data"]["expr"] = "v = 5"
    changes = merge_entry(e, inc, SRC_B)
    assert e["data"]["expr"] == "v = 5"
    assert ("data/expr", "fill") in changes

def test_equal_rewrite_is_noop_numbers_as_numbers():
    e = _base()
    inc = copy.deepcopy(e); inc["data"]["outputs"][0]["value"] = 5.0
    changes = merge_entry(e, inc, SRC_B)
    assert e["data"]["outputs"][0]["value"] == 5
    assert all(a == "noop" for _, a in changes if _ == "data/outputs/v/value")

def test_disagreeing_rewrite_materialises_incumbent_then_challenger():
    e = _base()
    inc = copy.deepcopy(e); inc["data"]["outputs"][0]["value"] = 4
    merge_entry(e, inc, SRC_B)
    assert e["data"]["outputs"][0]["value"] == 5   # NEVER overwrite
    accounts = e["accounts"]
    assert len(accounts) == 2
    assert accounts[0]["source"] == SRC_A and accounts[0]["value"] == 5
    assert accounts[1]["source"] == SRC_B and accounts[1]["value"] == 4
    assert all(a["status"] == "open" and a["field"] == "data/outputs/v/value"
               for a in accounts)

def test_rereading_same_account_is_a_noop():
    e = _base()
    inc = copy.deepcopy(e); inc["data"]["outputs"][0]["value"] = 4
    merge_entry(e, inc, SRC_B)
    n = len(e["accounts"])
    merge_entry(e, copy.deepcopy(inc), SRC_B)
    assert len(e["accounts"]) == n                 # dedup on (field, statement, value, ref, locator)

def test_source_union_on_dedup_key():
    e = _base()
    inc = copy.deepcopy(e); inc["source"] = [dict(SRC_A), dict(SRC_B)]
    merge_entry(e, inc, SRC_B)
    assert len(e["source"]) == 2
    merge_entry(e, copy.deepcopy(inc), SRC_B)
    assert len(e["source"]) == 2

def test_keyed_collection_member_merged_leaf_by_leaf():
    e = _base()
    e["kind"] = "record"
    e["data"] = {"medium": "sheet", "role": "reference", "location": {},
                 "fields": [{"key": "grams", "title": "گرم", "type": "number",
                             "unit": "g"}],
                 "rows": [{"key": "prod_61__ing_1", "grams": 250}]}
    inc = copy.deepcopy(e)
    inc["data"]["fields"][0]["unit"] = "kg"          # same column, different unit
    inc["data"]["rows"][0]["grams"] = 280            # same row, different grams
    inc["data"]["rows"].append({"key": "prod_61__ing_2", "grams": 40})
    merge_entry(e, inc, SRC_B)
    assert e["data"]["fields"][0]["unit"] == "g"     # disputed, not overwritten
    assert e["data"]["rows"][0]["grams"] == 250
    fields_disputed = {a["field"] for a in e["accounts"]}
    assert "data/fields/grams/unit" in fields_disputed
    assert "data/rows/prod_61__ing_1/grams" in fields_disputed
    assert e["data"]["rows"][1]["key"] == "prod_61__ing_2"   # unmatched member appended

def test_object_field_merged_key_by_key():
    e = _base()
    e["data"]["inputs"] = [{"key": "a", "title": "آ", "unit": "g",
                            "from": {"ref": "F-00031", "field": "end_stock"}}]
    inc = copy.deepcopy(e)
    inc["data"]["inputs"][0]["from"] = {"ref": "F-00031", "field": "start_stock"}
    merge_entry(e, inc, SRC_B)
    assert e["data"]["inputs"][0]["from"]["field"] == "end_stock"   # disputed leaf
    assert any(a["field"] == "data/inputs/a/from/field" for a in e["accounts"])
```

- [ ] **Step 2: Run** `.venv/bin/pytest engine/tests/test_merge_facts_ladder.py -q` — FAIL (`ModuleNotFoundError`).

- [ ] **Step 3: Implement `engine/merge_facts/ladder.py`**

```python
"""§11 write ladder — identical for every caller; there is no owner."""
from merge_facts import account_id

PROSE_LEAVES = frozenset({"statement", "grain", "method", "exceptions",
                          "reason", "why", "description"})
UNION_FIELDS = {"source": lambda s: (s.get("type"), s.get("ref"),
                                     s.get("cell") or s.get("lines") or
                                     s.get("function") or s.get("node") or
                                     s.get("page")),
                "aliases": lambda a: a,
                "processes": lambda p: p.get("ref")}
DEDUP_KEYS = {"accounts": lambda m: (m.get("field"), m.get("statement"),
                                     m.get("value"),
                                     (m.get("source") or {}).get("ref"),
                                     (m.get("source") or {}).get("cell")
                                     or (m.get("source") or {}).get("lines")),
              "issues": lambda m: (m.get("kind"), m.get("field"), m.get("from_date")),
              "foreignKeys": lambda m: (tuple(m.get("fields") or []),
                                        (m.get("reference") or {}).get("ref")),
              "signatures": lambda m: m.get("role"),
              "edge_cases": lambda m: m.get("input"),
              "reconciled_against": lambda m: tuple(sorted((m.get("cell") or {}).items())),
              "tracked": lambda m: (m.get("record") or {}).get("ref"),
              "units": lambda m: m.get("pack_unit"),
              "calls": lambda m: m.get("ref")}
OBJECT_FIELDS = frozenset({"from", "via", "writes_to", "derived", "mirror_of",
                           "location", "pack", "movement", "range", "refItems",
                           "constraints", "identifier_scheme", "fix", "of",
                           "template_of", "supersedes", "superseded_by", "scope"})
IMMUTABLE = frozenset({"id", "kind", "key", "status", "updated_at",
                       "field_status", "valid_from", "valid_to", "retired"})

def _equal(a, b):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return float(a) == float(b)
    return a == b

def _dispute(existing_entry, path, incumbent_value, challenger, source, changes):
    accounts = existing_entry.setdefault("accounts", [])
    def _add(statement, value, src):
        member = {"field": path, "statement": str(statement),
                  "value": value, "source": {k: v for k, v in src.items()
                                             if k not in ("hash", "run")},
                  "speaker_role": None, "status": "open"}
        member["id"] = account_id(path, member["statement"], value, member["source"])
        if not any(DEDUP_KEYS["accounts"](member) == DEDUP_KEYS["accounts"](a)
                   for a in accounts):
            accounts.append(member)
    if not any(a.get("field") == path for a in accounts):
        incumbent_src = (existing_entry.get("source") or [{}])[0]
        _add(incumbent_value, incumbent_value, incumbent_src)   # materialise the incumbent
    _add(challenger, challenger, source)
    changes.append((path, "dispute"))

def _merge_scalar(entry, holder, name, path, incoming_value, source, changes):
    current = holder.get(name)
    if name not in holder:
        holder[name] = incoming_value
        changes.append((path, "create"))
    elif current is None or current == "":
        holder[name] = incoming_value
        changes.append((path, "fill"))
    elif _equal(current, incoming_value):
        changes.append((path, "noop"))
    else:
        _dispute(entry, path, current, incoming_value, source, changes)

def _merge_object(entry, current, incoming, path, source, changes):
    for k, v in incoming.items():
        if isinstance(v, dict) and isinstance(current.get(k), dict):
            _merge_object(entry, current[k], v, f"{path}/{k}", source, changes)
        else:
            _merge_scalar(entry, current, k, f"{path}/{k}", v, source, changes)

def _merge_collection(entry, current, incoming, name, path, source, changes):
    keyfn = DEDUP_KEYS.get(name, lambda m: m.get("key"))
    for member in incoming:
        match = next((m for m in current if keyfn(m) == keyfn(member)), None)
        if match is None:
            current.append(member)
            changes.append((f"{path}/{keyfn(member)}", "append"))
        else:
            _merge_member(entry, match, member, f"{path}/{member.get('key', keyfn(member))}",
                          source, changes)

def _merge_member(entry, current, incoming, path, source, changes):
    for k, v in incoming.items():
        leaf = k.rsplit("/", 1)[-1]
        if k == "key":
            continue
        if leaf in PROSE_LEAVES:
            if k not in current or current.get(k) in (None, ""):
                current[k] = v
                changes.append((f"{path}/{k}", "fill"))
            continue                                   # never disputed, never rewritten
        if isinstance(v, list) and (v and isinstance(v[0], dict) or not v) \
                and k in DEDUP_KEYS or (isinstance(v, list) and v
                                        and isinstance(v[0], dict) and "key" in v[0]):
            current.setdefault(k, [])
            _merge_collection(entry, current[k], v, k, f"{path}/{k}", source, changes)
        elif isinstance(v, dict) and (k in OBJECT_FIELDS or isinstance(current.get(k), dict)):
            current.setdefault(k, {})
            _merge_object(entry, current[k], v, f"{path}/{k}", source, changes)
        else:
            _merge_scalar(entry, current, k, f"{path}/{k}", v, source, changes)

def merge_entry(existing, incoming, incoming_source):
    """Apply §11 to one matched pair. Mutates `existing`; returns [(path, action)]."""
    changes = []
    for name, keyfn in UNION_FIELDS.items():
        current = existing.setdefault(name, [])
        seen = {keyfn(m) if not isinstance(m, dict) or name != "source"
                else keyfn(m) for m in current}
        seen = {keyfn(m) for m in current}
        for member in incoming.get(name) or []:
            if keyfn(member) not in seen:
                current.append(member)
                seen.add(keyfn(member))
                changes.append((name, "union"))
    for k, v in incoming.items():
        if k in IMMUTABLE or k in UNION_FIELDS or k == "accounts":
            continue
        leaf = k.rsplit("/", 1)[-1]
        if k == "data":
            _merge_member(existing, existing.setdefault("data", {}), v, "data",
                          incoming_source, changes)
        elif leaf in PROSE_LEAVES:
            if existing.get(k) in (None, ""):
                existing[k] = v
                changes.append((k, "fill"))
        else:
            _merge_scalar(existing, existing, k, k, v, incoming_source, changes)
    # incoming accounts (the agent may state competing readings itself)
    if incoming.get("accounts"):
        _merge_collection(existing, existing.setdefault("accounts", []),
                          incoming["accounts"], "accounts", "accounts",
                          incoming_source, changes)
    return changes
```

Note for the implementer: the doubled `seen = …` line above is a bug you must fix while transcribing — keep only the second. The tests are the referee; refactor freely inside the file as long as they pass and the public name `merge_entry` and its return shape survive.

- [ ] **Step 4: Run** `.venv/bin/pytest engine/tests/test_merge_facts_ladder.py -q` — PASS.
- [ ] **Step 5: Commit** — `git add engine/merge_facts/ladder.py engine/tests/test_merge_facts_ladder.py && git commit -m "feat(facts): §11 write ladder"`

### Task 5: `merge facts apply`

**Files:**
- Create: `engine/merge_facts/apply.py`
- Modify: `engine/merge/cli.py` (a `facts` subparser tree: `merge facts apply --delta <path> --run <run_dir>`, and stubs for the later verbs that exit 2 with `precondition failed: not implemented yet`)
- Test: `engine/tests/test_merge_facts_apply.py`

**Interfaces:**
- Consumes: everything from Tasks 3–4; `allocate_id.next_fact_id`; `engine_common.validate`; `merge_facts.content.check_document` arrives in Task 9 — until then `apply` calls `validate("facts.schema.json", …)` only (leave a `# content pass wired in Task 9` marker and wire it there).
- Produces: `apply(root, delta_path, run_dir) -> dict` (the report: `{"created": [...], "updated": [...], "id_map": {...}}`); writes `{run_dir}/facts-delta.json` (copied), `{run_dir}/id-map.json`; CLI exit 2 on any precondition with **nothing written**.

Behaviour checklist `apply` must implement, in order (spec §12 row 1 — the precondition pass runs over the whole delta **before** the first write):

1. Validate the delta against `facts-delta.schema.json`.
2. Preconditions per entry: key pattern; branch registered in `attachments/sheets/manifest.json` and department in `departments/registry.json`; unit symbols declared by the `units` record (the `record` with key `units` — skipped for the delta that creates it); no `status`/`hash`/`original_ref` (schema already rejects); title guard (a **new** key whose `title` byte-equals an existing open title in the same kind+canonical scope → exit 2; skipped for `note`); immutability (an entry matched by natural key whose delta carries a **different** key → exit 2, unless the match is a stub).
3. Upsert in `KIND_ORDER` so a hit is found before a miss mints; allocate `F-` ids only on key miss; record `T-n → F-…` in the id map.
4. Second pass: rewrite every `iter_ref_objects` ref and every `refItems` cell holding a temp id, using the id map; unresolved `F-`/`T-` refs whose target is neither in store nor delta → exit 2 unless the target is a stub (deferred edge).
5. Derive measurement keys (`{item.key}__{record.key}__{column.key}`) and reference-record row keys (the `__`-join of `primaryKey` values when every member passes the minted-segment pattern; a minted row key is kept as written).
6. Apply the ladder to matches; supersede when the incoming value differs **and** carries a later `valid_from` (close `valid_to`, create the successor entry with `supersedes`/`superseded_by` links) — implemented in `apply`, not the ladder.
7. Move `data.original` to `facts/originals/{id}.txt` (`write_text_atomic`) and replace with `original_ref`.
8. Compute `source[].hash` via `sha256_file` for every resolvable `ref` (estate `.xlsx` absent → hash `null`, reported by `check`, never a failure); stamp `source[].run` with the run dir.
9. `entry["status"] = derive_status(entry)`; `updated_at` = now (UTC ISO); `save_store`.

- [ ] **Step 1: Write the failing test** — encode the §17 apply cases. Full test code:

```python
import copy, json, pathlib, subprocess, sys

from merge_facts import load_store
from merge_facts.apply import apply

def _root(tmp_path):
    (tmp_path / "facts").mkdir()
    (tmp_path / "departments").mkdir()
    (tmp_path / "departments" / "registry.json").write_text(json.dumps(
        {"departments": [{"code": "cooking", "name": "آشپزخانه"},
                         {"code": "management", "name": "مدیریت"}]}),
        encoding="utf-8")
    (tmp_path / "attachments" / "sheets").mkdir(parents=True)
    (tmp_path / "attachments" / "sheets" / "manifest.json").write_text(json.dumps(
        {"schema_version": 1,
         "branches": [{"code": "chalebagh", "name": "چاله‌باغ"}],
         "workbooks": []}), encoding="utf-8")
    return tmp_path

def _run_dir(tmp_path, n="20260901-101500"):
    d = tmp_path / "runs" / "facts" / "cooking" / n
    d.mkdir(parents=True)
    return d

def _units_delta():
    return {"schema_version": 1, "entries": [{
        "id": "T-1", "kind": "record", "key": "units", "title": "واحدها",
        "statement": "جدول واحدها", "scope": {"departments": [], "branches": []},
        "source": [{"type": "chat", "ref": None}], "retired": False,
        "data": {"medium": "native", "role": "config", "location": {},
                 "primaryKey": ["symbol"],
                 "fields": [{"key": "symbol", "title": "نماد", "type": "string"},
                            {"key": "dimension", "title": "بُعد", "type": "string"},
                            {"key": "factor_to_base", "title": "ضریب", "type": "number"},
                            {"key": "unit_title", "title": "عنوان", "type": "string"}],
                 "rows": [{"key": "g", "symbol": "g", "dimension": "mass",
                           "factor_to_base": 1, "unit_title": "گرم"},
                          {"key": "kg", "symbol": "kg", "dimension": "mass",
                           "factor_to_base": 1000, "unit_title": "کیلوگرم"}]}}]}

def _const_delta(value=5, key="tol", dept="cooking"):
    return {"schema_version": 1, "entries": [{
        "id": "T-1", "kind": "rule", "key": key, "title": "تلورانس " + key,
        "statement": "حد مجاز", "scope": {"departments": [dept], "branches": []},
        "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "11"}],
        "retired": False,
        "data": {"inputs": [], "outputs": [{"key": "v", "title": "مقدار",
                 "unit": "g", "nature": "limit", "value": value}]}}]}

def _write(tmp_path, name, delta):
    p = tmp_path / name
    p.write_text(json.dumps(delta, ensure_ascii=False), encoding="utf-8")
    return p

def _seed_units(root):
    apply(root, _write(root, "d0.json", _units_delta()), _run_dir(root, "20260901-000000"))

def test_create_then_idempotent_reapply_is_byte_identical(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _write(root, "d1.json", _const_delta())
    apply(root, d, _run_dir(root, "20260901-101501"))
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    apply(root, d, _run_dir(root, "20260901-101502"))
    after = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    assert before == after

def test_ids_allocated_only_on_miss_and_id_map_written(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    run = _run_dir(root, "20260901-101501")
    report = apply(root, _write(root, "d1.json", _const_delta()), run)
    assert report["id_map"]["T-1"] == "F-00002"          # F-00001 was units
    assert json.loads((run / "id-map.json").read_text())["T-1"] == "F-00002"
    report2 = apply(root, _write(root, "d2.json", _const_delta(value=5)),
                    _run_dir(root, "20260901-101502"))
    assert report2["id_map"] == {}                        # hit burns no id

def test_disagreeing_value_disputes_never_overwrites(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    apply(root, _write(root, "d2.json", _const_delta(4)), _run_dir(root, "2"))
    store = load_store(root)
    e = [x for x in store["rule"]["entries"] if x["key"] == "tol"][0]
    assert e["data"]["outputs"][0]["value"] == 5
    assert e["status"] == "disputed"
    assert len([a for a in e["accounts"] if a["status"] == "open"]) == 2

def test_later_valid_from_supersedes(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    d = _const_delta(4)
    d["entries"][0]["valid_from"] = "1405-01-01"
    apply(root, _write(root, "d2.json", d), _run_dir(root, "2"))
    store = load_store(root)
    rules = [x for x in store["rule"]["entries"] if x["key"] == "tol"]
    old = [r for r in rules if r["valid_to"] is not None][0]
    new = [r for r in rules if r["valid_to"] is None][0]
    assert new["supersedes"]["ref"] == old["id"]
    assert old["superseded_by"]["ref"] == new["id"]
    assert new["data"]["outputs"][0]["value"] == 4

def test_unregistered_branch_or_department_refused_nothing_written(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta(); d["entries"][0]["scope"]["branches"] = ["tehran"]
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    try:
        apply(root, _write(root, "dx.json", d), _run_dir(root, "9"))
        assert False, "expected SystemExit"
    except SystemExit as e:
        assert e.code == 2
    after = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    assert before == after

def test_unit_symbol_must_be_declared_and_message_names_it(tmp_path, capsys):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta(); d["entries"][0]["data"]["outputs"][0]["unit"] = "lb"
    try:
        apply(root, _write(root, "dx.json", d), _run_dir(root, "9"))
        assert False
    except SystemExit:
        pass
    assert "lb" in capsys.readouterr().err

def test_title_guard_same_kind_and_scope(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5, key="tol")), _run_dir(root, "1"))
    d = _const_delta(5, key="other_key")
    d["entries"][0]["title"] = "تلورانس tol"      # byte-equal title, new key
    try:
        apply(root, _write(root, "d2.json", d), _run_dir(root, "2"))
        assert False
    except SystemExit as e:
        assert e.code == 2

def test_original_moves_to_originals(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _const_delta()
    e = d["entries"][0]
    e["data"]["inputs"] = [{"key": "x", "title": "ایکس", "unit": "g",
                            "from": "operator"}]
    e["data"]["expr"] = "v = x"
    e["data"]["lang"] = "feel"
    e["data"]["original"] = "=X6"
    report = apply(root, _write(root, "d1.json", d), _run_dir(root, "1"))
    fid = report["id_map"]["T-1"]
    assert (root / "facts" / "originals" / f"{fid}.txt").read_text() == "=X6"
    store = load_store(root)
    entry = [x for x in store["rule"]["entries"] if x["id"] == fid][0]
    assert entry["data"]["original_ref"] == f"facts/originals/{fid}.txt"
    assert "original" not in entry["data"]

def test_dependency_order_item_record_measurement_in_one_delta(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    delta = {"schema_version": 1, "entries": [
        {"id": "T-3", "kind": "measurement", "key": "advisory",
         "title": "ثبت وزنی", "statement": "s",
         "scope": {"departments": ["cooking"], "branches": []},
         "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "1"}],
         "retired": False,
         "data": {"of": {"ref": "T-1"}, "quantity": "mass", "unit": "g",
                  "writes_to": {"ref": "T-2", "field": "end_stock"}}},
        {"id": "T-1", "kind": "item", "key": "ing_15", "title": "بیکن",
         "statement": "s", "scope": {"departments": [], "branches": []},
         "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "2"}],
         "retired": False, "data": {"category": "ingredient", "unit": "g"}},
        {"id": "T-2", "kind": "record", "key": "mande_shab", "title": "مانده شب",
         "statement": "s", "scope": {"departments": ["cooking"], "branches": []},
         "source": [{"type": "photo", "ref": "departments/cooking/attachments/p.jpg"}],
         "retired": False,
         "data": {"medium": "paper", "role": "log", "location": {"path": "x"},
                  "fields": [{"key": "end_stock", "title": "مانده آخر",
                              "type": "number", "unit": "g"}]}}]}
    report = apply(root, _write(root, "d1.json", delta), _run_dir(root, "1"))
    store = load_store(root)
    m = store["measurement"]["entries"][0]
    assert m["key"] == "ing_15__mande_shab__end_stock"     # derived by merge
    assert m["data"]["of"]["ref"] == report["id_map"]["T-1"]
    assert m["data"]["writes_to"]["ref"] == report["id_map"]["T-2"]

def test_row_keys_derived_on_reference_record(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    delta = {"schema_version": 1, "entries": [
        {"id": "T-1", "kind": "item", "key": "prod_61", "title": "پیتزا",
         "statement": "s", "scope": {"departments": [], "branches": []},
         "source": [{"type": "sheet", "ref": "attachments/sheets/M/M.xlsx"}],
         "retired": False, "data": {"category": "product", "unit": "pcs"}},
        {"id": "T-2", "kind": "item", "key": "ing_1", "title": "پنیر",
         "statement": "s", "scope": {"departments": [], "branches": []},
         "source": [{"type": "sheet", "ref": "attachments/sheets/M/M.xlsx"}],
         "retired": False, "data": {"category": "ingredient", "unit": "g"}},
        {"id": "T-4", "kind": "record", "key": "mavad__pizza", "title": "BOM",
         "statement": "s", "scope": {"departments": [], "branches": []},
         "source": [{"type": "sheet", "ref": "attachments/sheets/M/M.xlsx"}],
         "retired": False,
         "data": {"medium": "sheet", "role": "reference",
                  "location": {"spreadsheetId": "S", "sheetId": 2, "sheet": "پیتزا",
                               "hidden": False},
                  "primaryKey": ["product", "ingredient"],
                  "fields": [
                      {"key": "product", "title": "محصول", "type": "string",
                       "refItems": {"namespace": "#", "resolved_by": "code"}},
                      {"key": "ingredient", "title": "ماده", "type": "string",
                       "refItems": {"namespace": "##", "resolved_by": "code"}},
                      {"key": "grams", "title": "گرم", "type": "number", "unit": "g"}],
                  "rows": [{"key": "r1", "product": "prod_61",
                            "ingredient": "ing_1", "grams": 250}]}}]}
    apply(root, _write(root, "d1.json", delta), _run_dir(root, "1"))
    store = load_store(root)
    rec = [e for e in store["record"]["entries"] if e["key"] == "mavad__pizza"][0]
    assert rec["data"]["rows"][0]["key"] == "prod_61__ing_1"   # derived, delta's advisory

def test_cli_apply_via_subprocess(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    d = _write(root, "d1.json", _const_delta())
    run = _run_dir(root, "20260901-121500")
    proc = subprocess.run([sys.executable, "-m", "merge.cli", "facts", "apply",
                           "--delta", str(d), "--run", str(run)],
                          capture_output=True, text=True,
                          env={"DATA_ROOT": str(root), "PATH": ""}
                          | {"SCHEMA_DIR": str(pathlib.Path(__file__).resolve().parents[2] / "schemas"),
                             "SYSTEMROOT": ""})
    assert proc.returncode == 0, proc.stderr
```

- [ ] **Step 2: Run** `.venv/bin/pytest engine/tests/test_merge_facts_apply.py -q` — FAIL.

- [ ] **Step 3: Implement `engine/merge_facts/apply.py`.** Structure it as: `_preconditions(root, store, delta) -> list[str]` (returns human messages; any → print each as `precondition failed: {msg}` to stderr, `raise SystemExit(2)` before any write); `_upsert(store, delta, root) -> (id_map, reports)`; `_rewrite_refs(store, delta_entries, id_map)`; `_derive_keys(store, id_map)`; `_finalise(root, store, run_dir, delta_path, id_map)` (originals, hashes, `source[].run` stamp, status, `updated_at`, `save_store`, copy the delta + id map into the run dir). Key implementation notes, each mapped to a failing test above:
  - **Idempotency**: byte-identical reruns require deterministic `updated_at` — set `updated_at` **only on entries the run actually changed** (any ladder action other than `noop`, or creation). An untouched entry keeps its stored value; then a rerun of the same delta produces zero non-noop actions and writes identical bytes. `json.dumps` with `ensure_ascii=False, indent=1, sort_keys=False` via `write_json_atomic` is already deterministic.
  - **Unit check**: collect every `unit` string from payload leaves named `unit` (walk `data`), skip `None`/`"—"`, and require each to be an open row key of the record with key `units` — unless this delta itself creates that record. Failure message must contain the symbol.
  - **Supersede**: when `_ladder` would dispute a scalar but the incoming entry carries `valid_from` strictly later than the incumbent's (string compare works — QF-41 fixed-width), instead: deep-copy the incumbent as the successor's base, apply the incoming entry onto the copy with a fresh id, set old `valid_to = incoming.valid_from`, old `superseded_by = {ref: new_id}`, new `supersedes = {ref: old_id}`, append the successor.
  - **Stubs**: an unresolvable `{ref}` whose target entry (store or delta) has `data.stub: true` is recorded in the report as deferred, not failed. Creating stubs themselves (QF-20) is the agent's delta content, not apply logic — apply only tolerates the deferred edges.
  - CLI: in `engine/merge/cli.py`, add `facts` to the subparser tree with sub-subcommands; `apply` requires `--delta` and `--run`; unknown facts verb → stub exit 2 until its task lands. Keep the existing `except ValueError` → exit 2 envelope.

- [ ] **Step 4: Run** `.venv/bin/pytest engine/tests/test_merge_facts_apply.py -q` — PASS. Also `.venv/bin/pytest engine/tests/test_merge_cli.py -q` (existing process verbs untouched).
- [ ] **Step 5: Commit** — `git add engine/merge_facts/apply.py engine/merge/cli.py engine/tests/test_merge_facts_apply.py && git commit -m "feat(facts): merge facts apply — preconditions, upsert, refs, keys, originals"`

### Task 6: `resolve`, `retire`, `promote`, `export`

**Files:**
- Create: `engine/merge_facts/verbs.py`
- Modify: `engine/merge/cli.py` (wire the four verbs; `resolve --id --field --account --run`, `retire --id [--heir] --run`, `promote --id --kind [--key] --run`, `export --record <key> [--out] [--all]`)
- Test: `engine/tests/test_merge_facts_verbs.py`

**Interfaces:**
- Consumes: Task 3 core, Task 5's store-on-disk shape.
- Produces: `resolve(root, fact_id, field, account_id, run_dir)`, `retire(root, fact_id, heir, run_dir)`, `promote(root, fact_id, kind, key, run_dir)`, `export(root, record_key, out, include_retired) -> csv_path`. Each writing verb re-derives `status`, bumps `updated_at` on the touched entry only, rebuilds the index via `save_store`, and appends what it did to `{run_dir}/facts-delta.json` (shape `{"verb": ..., "args": {...}}` — enough for `revert` and the audit trail).

- [ ] **Step 1: Failing tests** (reuse Task 5's `_root`/`_seed_units`/`_const_delta` helpers by importing them from `engine/tests/test_merge_facts_apply.py` — move them into a shared `engine/tests/facts_helpers.py` first and update the Task 5 imports):

```python
from facts_helpers import _root, _seed_units, _const_delta, _write, _run_dir
from merge_facts import load_store
from merge_facts.apply import apply
from merge_facts.verbs import export, promote, resolve, retire
import pytest

def _disputed(root):
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    apply(root, _write(root, "d2.json", _const_delta(4)), _run_dir(root, "2"))
    e = [x for x in load_store(root)["rule"]["entries"] if x["key"] == "tol"][0]
    return e

def test_resolve_marks_chosen_rejects_rest_confirms_field(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    e = _disputed(root)
    chosen = [a for a in e["accounts"] if a["value"] == 4][0]
    resolve(root, e["id"], "data/outputs/v/value", chosen["id"], _run_dir(root, "3"))
    e = [x for x in load_store(root)["rule"]["entries"] if x["id"] == e["id"]][0]
    states = {a["value"]: a["status"] for a in e["accounts"]}
    assert states == {5: "rejected", 4: "chosen"}
    assert e["data"]["outputs"][0]["value"] == 4        # the chosen account lands
    assert e["status"] == "confirmed"

def test_retire_sets_flags_and_refuses_retired_heir(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5, key="a")), _run_dir(root, "1"))
    apply(root, _write(root, "d2.json", _const_delta(5, key="b")), _run_dir(root, "2"))
    store = load_store(root)
    a = [x for x in store["rule"]["entries"] if x["key"] == "a"][0]
    b = [x for x in store["rule"]["entries"] if x["key"] == "b"][0]
    retire(root, a["id"], b["id"], _run_dir(root, "3"))
    a2 = [x for x in load_store(root)["rule"]["entries"] if x["id"] == a["id"]][0]
    assert a2["retired"] and a2["valid_to"] and a2["superseded_by"]["ref"] == b["id"]
    with pytest.raises(SystemExit):
        retire(root, b["id"], a["id"], _run_dir(root, "4"))   # heir is retired

def test_promote_keeps_id_recomputes_key_refuses_collision(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    note = {"schema_version": 1, "entries": [{
        "id": "T-1", "kind": "note", "key": "note_ab12cd34ef56",
        "title": "یادداشت", "statement": "هر پرس ۶۰ گرم",
        "scope": {"departments": ["cooking"], "branches": []},
        "source": [{"type": "voice", "ref": "meetings/transcripts/c.txt", "lines": "5"}],
        "retired": False, "data": {}}]}
    r = apply(root, _write(root, "dn.json", note), _run_dir(root, "1"))
    nid = r["id_map"]["T-1"]
    promote(root, nid, "rule", "portion_g_roast_beef", _run_dir(root, "2"))
    store = load_store(root)
    assert not any(e["id"] == nid for e in store["note"]["entries"])
    e = [x for x in store["rule"]["entries"] if x["id"] == nid][0]
    assert e["key"] == "portion_g_roast_beef" and e["kind"] == "rule"
    with pytest.raises(SystemExit):                         # promote without --key where minted
        promote(root, nid, "note", None, _run_dir(root, "3"))

def test_export_reference_record_csv(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    out = export(root, "units", tmp_path / "u.csv", include_retired=False)
    text = out.read_text(encoding="utf-8")
    assert text.splitlines()[0] == "key,symbol,dimension,factor_to_base,unit_title"
    assert "g,g,mass,1," in text
    with pytest.raises(SystemExit):
        export(root, "units", root / "facts" / "u.csv", include_retired=False)  # under facts/
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement `verbs.py`** — each verb: `load_store`, locate the entry by id across kinds (exit 2 if absent), mutate, `save_store`, append the verb record to the run's `facts-delta.json`. `resolve` also writes the chosen account's `value` into the disputed path via a small `set_path` you add to `merge_facts/__init__.py` (mirror of `get_path`). `export`: refuse `role` not in `{reference, config}` and `--out` under `facts/` or `runs/`; header is `key` + declared `fields[].key` order; retired rows omitted unless `include_retired`. **Step 4: Run** — PASS. **Step 5: Commit** `feat(facts): resolve, retire, promote, export`.

### Task 7: `revert`

**Files:**
- Create: `engine/merge_facts/revert.py`  · Modify: `engine/merge/cli.py` (`merge facts revert --run <run_dir>`)
- Test: `engine/tests/test_merge_facts_revert.py`

**Interfaces:** `revert(root, run_dir)` — reads the run's `facts-delta.json` + `id-map.json`; removes entries the run created (their ids never reused — the ledger is not decremented); restores every path the run wrote from the previous git commit of the facts files (`git -C <root> show HEAD~n:facts/rules.json` is NOT used — instead the run dir keeps a `facts-before/` snapshot: **change Task 5's `_finalise`** to copy the five files into `{run_dir}/facts-before/` before writing; document this in `apply.py` and reflect it in `facts-run-meta` docs). Refuses (exit 2) when any later run's delta touched one of the same paths.

- [ ] **Step 1: Failing tests**

```python
from facts_helpers import _root, _seed_units, _const_delta, _write, _run_dir
from merge_facts import load_store
from merge_facts.apply import apply
from merge_facts.revert import revert
import pytest

def test_revert_restores_byte_identical_store(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    before = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    run = _run_dir(root, "20260901-101501")
    apply(root, _write(root, "d1.json", _const_delta()), run)
    revert(root, run)
    after = {p.name: p.read_bytes() for p in (root / "facts").glob("*.json")}
    assert before == after

def test_revert_reopens_predecessor(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    d = _const_delta(4); d["entries"][0]["valid_from"] = "1405-01-01"
    run2 = _run_dir(root, "2")
    apply(root, _write(root, "d2.json", d), run2)
    revert(root, run2)
    rules = [x for x in load_store(root)["rule"]["entries"] if x["key"] == "tol"]
    assert len(rules) == 1 and rules[0]["valid_to"] is None

def test_revert_refuses_when_later_run_touched_same_paths(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    runA = _run_dir(root, "1")
    apply(root, _write(root, "d1.json", _const_delta(5)), runA)     # writes data/.../value
    apply(root, _write(root, "d2.json", _const_delta(4)), _run_dir(root, "2"))  # disputes same path
    with pytest.raises(SystemExit) as e:
        revert(root, runA)
    assert e.value.code == 2

def test_ids_never_reused_after_revert(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    run = _run_dir(root, "1")
    r1 = apply(root, _write(root, "d1.json", _const_delta(key="a")), run)
    revert(root, run)
    r2 = apply(root, _write(root, "d2.json", _const_delta(key="b")), _run_dir(root, "2"))
    assert r2["id_map"]["T-1"] != r1["id_map"]["T-1"]
```

- [ ] **Step 2–5:** run (FAIL) → implement (`facts-before/` snapshot restore for touched paths; created-entry removal; later-run overlap check by scanning `runs/facts/**/facts-delta.json` with a stamp later than this run's and intersecting written paths; §18 ceiling comment `ponytail: no three-way merge`) → run (PASS; also rerun Task 5's suite — the `facts-before/` change touches `apply`) → commit `feat(facts): revert from run snapshots`.

### Task 8: `audit` and `check`

**Files:**
- Create: `engine/merge_facts/audit.py` · Modify: `engine/merge/cli.py` (report verbs take no `--run`)
- Test: `engine/tests/test_merge_facts_audit.py`

**Interfaces:** `audit(root) -> list[dict]` and `check(root) -> list[dict]`, each item `{"code": str, "id": str | None, "message": str, "proposal": str | None}`; the CLI prints one line per item (`{code} {id} {message}`), exit 0 always (reporting, never failing). `check` also prints the coverage line as its last stdout line, exactly: `coverage: {n} of {m} workbooks read` (the ui-backend re-serves it in Persian — Phase 3).

Audit findings to implement, one small function per code, all pure walks over `load_store` + the manifest + `departments/**` (spec §12 verb table — implement each; the test asserts a representative trigger for each code):
`duplicate_output` (two rules writing one `{ref, field}`), `lookalike_title` (case/space-folded equality on titles or keys), `orphan_ref` (dangling `{ref}`/`field`/`row`, deferred edges made checkable), `dangling_ref_items` (refItems cell naming a retired/absent item), `process_link` (node gone or process tombstoned — propose the heir from `superseded_by`), `row_gone` (store rows absent from latest dump — needs the dump; report `dump missing` when absent), `retired_row_live_edges`, `template_drift` (expr differs from `template_of` target), `reconciliation` (cell vs constant beyond 1 %), `component_sum` (shares/parts vs total beyond 1 %), `unconsumed_constant`, `recurring_note_shape`, `stale_stub` (untouched 3 runs in creating department or >30 days), `natural_key_dup`, `scope_shadow` (non-empty-scope key existing at empty scope), `unit_raw_uncovered`, `unknown_role` (role strings absent from every process's `actor`/`mechanisms`).

- [ ] **Step 1: Failing tests** — build small stores through `apply` fixtures that trigger at least: `duplicate_output`, `orphan_ref`, `natural_key_dup` is unreachable through `apply` (apply refuses) so construct it by two applies at different scopes + a hand-check that audit stays quiet, `scope_shadow`, `unconsumed_constant`, `unknown_role`, `process_link` (write a minimal `departments/cooking/processes/cooking-001.json` fixture with `tombstoned: true, superseded_by: "cooking-017"` and an entry whose `processes` names it — assert the proposal names the heir), and `check`'s moved-source (rewrite the cited file after apply) + absent-estate + uncited-workbook + the coverage line. Test code follows the Task 6 pattern (helpers from `facts_helpers.py`); write one test per finding code with the minimal store that triggers it, asserting `code` and, for `process_link`, `proposal == "cooking-017"`.
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat(facts): audit and check verbs`.

### Task 9: `validate facts` content pass

**Files:**
- Create: `engine/merge_facts/content.py` · Modify: `engine/validate/cli.py` (after schema validation, when the schema name is `facts.schema.json` or `facts-delta.schema.json`, run the content pass and treat its findings as validation failures), `engine/merge_facts/apply.py` (call `content.check_document` per entry in the precondition pass — replacing the Task 5 marker)
- Test: `engine/tests/test_validate_facts_content.py`

**Interfaces:** `check_document(doc, kind_of_file) -> list[str]` (messages; empty = pass). Checks, each a small function (spec §12 `validate facts` paragraph):

1. **`expr` tokeniser** — split on whitespace/operators; every identifier ∉ `{if,then,else,and,or,not,min,max,sum,abs,round,over,of}` ∪ numeric literals must be in `inputs[].key ∪ outputs[].key ∪ calls[] rule keys`; the aggregate form `sum over <input> of (<a> * <b>)` requires `<input>`'s `from` to be `{ref, field}` with no `row`.
2. Unit edges: input `unit` differs from its source's declared unit and no `via` → failure (intra-delta check where the target is in the same file; cross-store is apply's).
3. Key patterns + `__` reservation; `refItems` cell values matching the minted pattern.
4. Reference shape and prefix (already schema-carried; re-assert `processes[].ref` grammar).
5. `primaryKey`/`foreignKeys[].fields`/`rows[].section` membership; reserved row-member names (`key,title,unit,unit_raw,section,when,open,retired,valid_to,supersedes`); every non-`derived` declared field present on every open row of a `role: reference` record (`null` allowed).
6. Shares in (0,1], summing to 1 ± 0.001 when more than one output carries `share`.
7. Constant shape: `inputs == []` ⇒ no `expr`/`lang` and every output carries `value` (may be `null`) or `range`; `inputs != []` ⇒ `lang` with `expr` or `original`, and no `value`/`range` on outputs.
8. `field_status` paths exist and values ∈ {inferred, informal}.
9. `reconciled_against`: `cell` declared here; (`against` resolution is apply's).
10. Jalali date patterns (schema-carried; re-assert `issues[].from_date`).
11. `source[].ref` never names `.structure.md` or `NAMED_FUNCTIONS.md`.
12. `processes[]` entry with no `process`-type source citing that ref's file, or a cited `node` absent — the file check runs in apply (store access); here assert the *source presence* only.

- [ ] **Step 1: Failing tests** — one test per numbered check with a minimal doc: an `expr` with an undeclared identifier fails; a g→kg edge without `via` fails (both ends in one delta); shares summing to 0.9 fail; `source.type: "index"`-style exclusion — a `ref` of `Pitza.structure.md` fails; a bad `from_date` fails; a rule with inputs and a `value` output fails; a constant with `expr` fails; `field_status` naming a missing path fails; a reference row missing a declared column fails; a `processes[]` entry with no matching `process` source fails.
- [ ] **Step 2–5:** FAIL → implement → PASS (also rerun Task 5's apply suite — apply now runs the content pass) → commit `feat(facts): validate content pass`.

### Task 10: `dump-workbook`

**Files:**
- Create: `engine/dump_workbook/__init__.py`, `engine/dump_workbook/cli.py`, `engine/dump_workbook/README.md`
- Modify: `engine/pyproject.toml` (`dump-workbook = "dump_workbook.cli:main"` script + `dump_workbook*` in packages-find)
- Create: `engine/tests/fixtures/make_workbook.py` (fixture builder), `engine/tests/test_dump_workbook.py`

**Interfaces:**
- Consumes: stdlib only — `zipfile` + `xml.etree.ElementTree` (no new dependency; spec Appendix C).
- Produces: CLI `dump-workbook --init-manifest` and `dump-workbook --manifest`, both `DATA_ROOT`-relative over `attachments/sheets/`; per workbook `attachments/sheets/.dump/{spreadsheetId}/{sheets.json, formulas.tsv, names.tsv, validations.tsv, cf.tsv, comments.tsv, meta.json}` and, for confirmed `reference_tabs`, `rows.tsv`. Python API: `dump_workbook(xlsx_path, structure_md_path, out_dir, reference_tabs=(), prev_sheets=None) -> dict` and `init_manifest(sheets_root) -> manifest dict` (mechanical columns only, idempotent, appends `confirmed: false` rows for new files).

Implementation notes bound to the tests below (each is a spec §17 bullet):
- **Shared formula groups**: an `<f t="shared" ref="..." si="N">` defines a group; followers carry only `si`. Group by `si`, count members from the `ref` range plus followers, normalise row numbers in the formula text (`re.sub(r"(?<![A-Z$])(\d+)", "N", ...)` applied only inside A1 references) — a naive per-cell walk under-counts (`Amadesazi!بازدهی` by 97 %).
- **DUMMYFUNCTION unwrap**: `IFERROR(__xludf.DUMMYFUNCTION("…"&"…"), cached)` → join the `"&"`-split 255-char string literals, un-double inner quotes, keep `cached` beside the unwrapped source.
- **Defined names**: every `<definedName>` incl. LAMBDA bodies verbatim, with workbook or `localSheetId` scope.
- **Threaded comments**: text from `xl/threadedComments/threadedComment*.xml` linked through sheet `_rels`; author from `xl/persons/person.xml` via `personId` mapped through a role table argument (default: everything → `unknown`) — never the display name; legacy `xl/comments*.xml` only for non-threaded ones (discard threaded placeholders).
- **Header row**: first row that is mostly non-numeric text (≥ half of non-empty cells), scanning the first 5 rows — 39 of 316 tabs have a merged band or blank row 1.
- **spreadsheetId**: read from the sibling `.structure.md`'s first `- spreadsheetId:` line; absence → exit 2 naming the file.
- **sheetId drift**: `sheets.json` stores the previous dump's `(sheetId → name)` map; a re-dump reports any pair whose name changed, on stdout as `drift: {old} -> {new}`.
- **rows.tsv**: only for tabs named in the workbook's **confirmed** manifest row's `reference_tabs[]`; header = the tab's header row; cells verbatim; no other tab's plain cells are dumped (QF-1).

- [ ] **Step 1: Build the fixture builder** `engine/tests/fixtures/make_workbook.py` — a function `make_workbook(path, *, shared_formula=True, dummyfunction=True, lambda_name=True, threaded_comment=True, merged_band_header=True, reference_tab=True)` that writes a minimal `.xlsx` with `zipfile` (hand-written `xl/workbook.xml`, `xl/worksheets/sheet1.xml` with a shared-formula range of 5 cells, a `DUMMYFUNCTION` literal split across `"&"`, a `definedName` LAMBDA, a threaded comment with a `personId`, a merged first row above the header, and a small 3×3 reference tab) plus the sibling `.structure.md` carrying `- spreadsheetId: TESTID01`. This is deterministic hand-rolled XML — copy the element shapes from a real export (open one under `attachments/sheets/` if present on this machine; otherwise the OOXML shapes in the spec's Appendix C are sufficient).
- [ ] **Step 2: Write the failing tests** — one per bullet above: group count == 5 for the shared range; the LAMBDA body appears in `names.tsv`; the unwrapped Google formula appears in `formulas.tsv` with the cached value; the comment row's author is `unknown` and its text present; `header_row` skips the merged band; a missing `.structure.md` id → `SystemExit(2)`; a second dump after renaming the tab reports drift; `rows.tsv` exists only for the reference tab and holds its cells verbatim; `--init-manifest` rerun over a folder with one new workbook appends exactly one `confirmed: false` row and touches nothing else.
- [ ] **Step 3–5:** FAIL → implement → PASS → commit `feat(facts): dump-workbook`.

### Task 11: `extract-attachment` dispatcher + Vertex vision

**Files:**
- Modify: `engine/extract_attachment/__init__.py`, `engine/extract_attachment/cli.py`, `engine/extract_attachment/README.md`
- Create: `engine/extract_attachment/vision.py`
- Modify: `config/engine.env.example`, `deploy/docker-compose.yml`, `deploy/docker-compose.local.yml` (add `VERTEX_VISION_MODEL=gemini-3.1-pro-preview` beside `GEMINI_MODEL` in every service that runs `extract-attachment`), `engine/pyproject.toml` (note in `[project.optional-dependencies] vertex` comment)
- Test: `engine/tests/test_extract_attachment_dispatch.py`

**Interfaces:**
- Produces: CLI `extract-attachment <department>` (unchanged call shape) and `extract-attachment --path <dir>`; dispatch table per spec QF-30 (`.docx`→text, `.pdf`→`.text/{stem}.pdf.md`, images→`.text/{stem}.image.md`, `.csv/.md/.txt/.gs` read directly, `.xlsx` skipped with the workbook message, unknown skipped with reason); exit 0 all converted, **3** advisory skips, 2 precondition; hash-gated cache for every converter (a `{stem}.sha256` sidecar in `.text/`); `vision.describe(path, kind) -> str` using the transcribe package's client pattern (`genai.Client(vertexai=True, project=VERTEX_PROJECT, location=VERTEX_LOCATION)`, model from `VERTEX_VISION_MODEL` — never a literal), with the fixed prompt of QF-30 (document title, header fields, columns with units, fixed rows in order, sections and document-number fields, shaded/read-only cells, signature bands, verbatim printed text, and a final `handwriting: yes|no` line). Missing `vertex` extra → `skipped {name}: vertex extra not installed`.

- [ ] **Step 1: Failing tests** (Vertex stubbed by injecting a fake describer, mirroring `test_transcribe.py`'s `FakeTranscriber` pattern):

```python
# key cases — full file mirrors these shapes for every dispatch row
def test_unknown_extension_skips_and_exit_3(tmp_path, capsys): ...
    # place a.docx + b.xyz under attachments/; run; a converted; stderr has "skipped b.xyz"; rc == 3
def test_xlsx_skipped_with_workbook_reason(tmp_path, capsys): ...
    # "workbooks are dumped by dump-workbook from attachments/sheets/"
def test_vertex_path_writes_image_md_and_asserts_handwriting_line(tmp_path): ...
    # fake describer returns "…\nhandwriting: no"; output file endswith that line
def test_touched_but_unchanged_docx_not_reconverted(tmp_path): ...
    # convert; os.utime the source; convert again; fake converter called once (hash gate)
def test_path_flag_roots_elsewhere(tmp_path): ...
    # --path attachments/sheets converts a .pdf there into attachments/sheets/.text/
def test_missing_vertex_extra_reports_skip(monkeypatch, tmp_path): ...
    # monkeypatch vision.AVAILABLE = False; .pdf → skipped line, rc == 3
```

- [ ] **Step 2–5:** FAIL → implement (dispatcher table as a module-level dict `CONVERTERS: dict[str, Callable]`; `run_extract_attachment` keeps its signature and grows `path=None`; exit-code logic: any error → 2 only when nothing written and the failure is structural, else 3 when `skipped` non-empty, else 0; document exit 3 in `engine/README.md` beside the other verbs' contract) → PASS → commit `feat(facts): extract-attachment dispatcher with Vertex vision path`.

### Task 12: Tombstone `facts:` warning lines

**Files:**
- Modify: `engine/merge/cli.py` (the `remove` and `restructure` arms)
- Test: `engine/tests/test_merge_tombstone_facts_warning.py`

**Interfaces:** after a successful tombstone, a read-only lookup of `facts/.index.json`: for every index row whose `processes` names the tombstoned process id, print `facts: {id} «{title}» → {pid}` plus ` (heir {heir})` when the tombstoned process document carries `superseded_by`. Prints nothing when the index file is absent. No facts write. (The playbook relays these lines in Persian — Phase 2.)

- [ ] **Step 1: Failing test** — build a cooking process file + a facts index (hand-written JSON is fine here: the index is **read**, not written, and building it through `apply` would drag the whole Phase 1 fixture stack into a merge test; the guard rule "tests go through the verb" applies to the five store files, which this test never touches); run `merge remove` via subprocess; assert the three `facts:` lines and their heir; delete the index; assert silence.
- [ ] **Step 2–5:** FAIL → implement (a `_facts_referencing(root, pid)` helper in `merge/cli.py`, ~15 lines) → PASS → commit `feat(facts): tombstone warning lines name referencing facts`.

---

# Phase 2 — Runtime (data-repo) and docs

Phase 2's deliverables are mostly Markdown read by an LLM at run time; their "tests" are the guard's pytest suite, `validate`-checked artefacts, and review against the spec text. Full verbatim content for the two big playbooks lives in the spec (§13 stage tables, QF-19 obligations, QF-38) — the tasks below transcribe it, they do not summarise it.

### Task 13: The guard, the hard rules, gitignore (data-repo)

**Files (all in `../data-repo`):**
- Modify: `.claude/hooks/guard.py`, `.claude/hooks/test_guard.py`, `CLAUDE.md`, `.gitignore`

- [ ] **Step 1: Failing tests** in `test_guard.py`, following its `run(payload, root)`/`w(path)`/`bash(cmd)` helpers:

```python
def test_block_facts_write(tmp_path):
    assert run(w("facts/rules.json"), tmp_path).returncode == 2

def test_block_facts_bash_redirect(tmp_path):
    assert run(bash("echo '{}' > facts/rules.json"), tmp_path).returncode == 2

def test_allow_facts_delta_write(tmp_path):
    assert run(w("runs/facts/cooking/20260901-101500/facts-delta.json"),
               tmp_path).returncode == 0
```

- [ ] **Step 2: Run** `python3 -m pytest ../data-repo/.claude/hooks/test_guard.py -q` — FAIL.
- [ ] **Step 3: Implement** — in `guard.py`: `FACTS_REL_RE = re.compile(r"facts/.+")` checked with `fullmatch` in `_check_write_path` beside `PROCESSES_REL_RE`; `FACTS_CMD_RE = re.compile(r"(^|[^a-z])facts/[^ ]+\.json")` in the Bash arm beside `PROCESSES_CMD_RE` (gated behind the existing `MUTATION_RE`).
- [ ] **Step 4:** PASS. **Step 5:** `CLAUDE.md` hard-rules block gains: `` - `facts/**` is written **only** by the `merge facts` CLI — the agent writes only `runs/facts/{dept}/{stamp}/facts-delta.json`. `` and the roles line names `speaker_role`, `filled_by`, `approved_by`, `by`, `signatures[].role`. `.gitignore` gains `attachments/sheets/**/*.xlsx`. Commit in data-repo: `git -C ../data-repo add .claude/hooks CLAUDE.md .gitignore && git -C ../data-repo commit -m "feat(facts): guard facts/ as merge-only; xlsx ignored"`.

### Task 14: The `quantify` agent and playbook (data-repo)

**Files:**
- Create: `../data-repo/.claude/agents/quantify.md`, `../data-repo/.claude/skills/quantify/SKILL.md`

- [ ] **Step 1: Write `agents/quantify.md`.** Frontmatter mirrors `.claude/agents/extract.md` (read it first for the exact field set); `model: claude-opus-5[1m]` (the `[1m]` suffix is mandatory — without it the runtime silently gets 200K context), `tools: Read, Glob, Write`. Body = the QF-19 obligations **transcribed in full from the spec** (the nine numbered full-mode obligations, the targeted-mode paragraph, the manifest-mode paragraph), plus the non-negotiables block copied from `extract.md`'s equivalent (fill-empty, no fabrication, cite every source, IDs only from `allocate-id`) and the delta contract: output is `{run_dir}/facts-delta.json` conforming to `facts-delta.schema.json`, temp ids `T-1…`, `{ref}` envelopes, a `key` on every entry, return only the path and the Persian summary.
- [ ] **Step 2: Write `skills/quantify/SKILL.md`.** Frontmatter like `process-voice` (name, description). Body structure copied from `process-voice/SKILL.md`: the turn-discipline block adapted (the ONLY legitimate end-of-turn points are Gate M, Gate A, Gate B, stage C's per-item gates, and the very end), then one section per stage **transcribed from spec §13's `quantify` table** — stages 0, M, resolve-the-set, A, 1, 2, 3, 4, B, 5, 6, 7, C — each with its exact engine commands (`dump-workbook --init-manifest`, `Task: quantify` with mode and inputs, `validate facts-delta`, `merge facts apply --delta … --run …`, `extract-attachment {dept}` and `--path attachments/sheets`, the git allowlist commit `git -C <data-repo> add departments runs facts attachments && git commit`), the two-failure bound on re-dispatch after validate errors, and the stage-ordering table at the end, as `process-voice` has. Gate M's Persian checkpoint lists the manifest rows one per line with the agent's reasons and `?` marks; on «تأیید» the playbook writes the manifest with `confirmed: true` and reruns `dump-workbook --manifest`.
- [ ] **Step 3: Verify** — `validate` the example delta in the skill (if any inline) against `facts-delta.schema.json`; proofread every engine command against Phase 1's CLIs (a wrong flag here costs a live run); check the skill never instructs writing under `facts/` directly (the guard would block it).
- [ ] **Step 4: Commit** — `git -C ../data-repo add .claude/agents/quantify.md .claude/skills/quantify && git -C ../data-repo commit -m "feat(facts): quantify agent and playbook"`.

### Task 15: `edit-fact` playbook + the two one-sentence relays (data-repo)

**Files:**
- Create: `../data-repo/.claude/skills/edit-fact/SKILL.md`
- Modify: `../data-repo/.claude/skills/process-voice/SKILL.md` (Stage 9), `../data-repo/.claude/skills/edit-process/SKILL.md` (Step 6)

- [ ] **Step 1: Write `edit-fact/SKILL.md`** mirroring `edit-process`'s step structure (read it first): Step 1 resolve the entry (id, key or title search over `facts/.index.json`; ambiguity → ask); Step 2 create `runs/facts/{dept}/{stamp}/` with `meta.json` (`origin: chat`, the instruction verbatim); Step 3 dispatch `Task: quantify` in **targeted** mode with the instruction and the loaded entry; Step 4 gate the destructive cases — retiring and merging get a one-line Persian confirmation; overwriting a filled field gets the field-by-field current-value-first prompt (INV-5), exactly as `edit-process` gates `set_process`; Step 5 run the matching verb (`merge facts apply|resolve|retire|promote … --run <run_dir>`); Step 6 commit (the allowlist) and report in Persian. Include the spec's four example instructions verbatim as usage examples.
- [ ] **Step 2: The two relays** — append to `process-voice` Stage 9: «اگر خروجی `merge remove`/`merge restructure` خطی با پیشوند `facts:` داشت، همان را به فارسی بازگو کن — دادهٔ کمّی نام‌برده به فرایند حذف‌شده اشاره می‌کند و وارث پیشنهادی را نشان می‌دهد.» and the equivalent single sentence to `edit-process` Step 6. **Nothing else in either file changes** (spec: the only change either playbook takes).
- [ ] **Step 3: Commit** — `git -C ../data-repo add .claude/skills && git -C ../data-repo commit -m "feat(facts): edit-fact playbook; tombstone relay sentences"`.

### Task 16: Runbook 07, env docs, ARD/PRD/CLAUDE.md rows (code-repo)

**Files:**
- Create: `docs/runbooks/07-facts.md`
- Modify: `engine/README.md`, `docs/runbooks/02-secrets-and-auth.md` or `04` (the variable table that documents engine env vars — locate the `GEMINI_MODEL` row and add `VERTEX_VISION_MODEL` beside it), `docs/runbooks/05-operations.md` (backup section: `attachments/sheets/` server-snapshot bullet; `app.db` bullet gains the fact review record), `ARD.md` (§2.2 tree + committed-set + git-add allowlist), `PRD.md` (NFR-16 gains "confirmations"), `CLAUDE.md` (Engine CLIs table: `dump-workbook`, `merge facts`, `allocate-id fact`, rewritten `extract-attachment` row; Pointers table: `quantify` agent + `quantify`/`edit-fact` skills; Pipeline entry points `/quantify`, `/edit-fact`)

- [ ] **Step 1: Write `docs/runbooks/07-facts.md`** with numbered operator sections: (1) where the store lives and what commits it (the git-add allowlist, the xlsx exclusion); (2) placing the estate by hand + `dump-workbook --init-manifest`; (3) bootstrap order — the `units` record first **in a run of its own** (include the complete units-record delta JSON verbatim from spec §10's seeded list, ready to paste), then universal seeds under `management`, then station/warehouse, then sales/ingredients, then reports; (4) seeding the universal confirmations at `*` through the confirmations API (a numbered `curl` sequence against `/api/confirmations/F-…`); (5) the coverage line and what "read" means; (6) undoing a run (`merge facts revert --run …`); (7) readiness and handover (QF-44: the `check`-clean + all-green test, the git tag naming `facts/`, `attachments/sheets/`, run dirs; `.xlsx` copied from the snapshot).
- [ ] **Step 2:** The other doc rows, each one line to a few lines, exactly as listed in spec §16.
- [ ] **Step 3: Commit** — `docs(facts): runbook 07 and doc rows`.

---

# Phase 3 — ui-backend (code-repo)

Run all Phase 3 tests as `.venv/bin/pytest ui-backend/tests/<file> -q` from the repo root. Every route uses the uniform-404 idiom (`access.NOT_FOUND`) and the existing `requires`-style gating; every new route lands in `test_endpoint_matrix.py`'s `GATED`/`FILTERED` tables so the whole matrix applies to it for free.

### Task 17: Facts fingerprint, `_kind: fact`, the gate, the commit-id column

**Files:**
- Modify: `ui-backend/inja_ui_backend/fingerprint.py`, `ui-backend/inja_ui_backend/routers/confirmations.py`, `ui-backend/inja_ui_backend/db.py`, `ui-backend/inja_ui_backend/store/confirmations.py`, `ui-backend/inja_ui_backend/access.py`
- Create: `ui-backend/inja_ui_backend/facts_store.py` (this task: only `load_entry`/`load_index`; Task 18 grows it)
- Test: `ui-backend/tests/test_facts_confirmations.py`

**Interfaces:**
- Produces: `fingerprint.fact_fingerprint(doc) -> str` — canonical JSON with **`updated_at` dropped at the envelope's top level only** (never deep: a `data` key or record column named `updated_at` is content; `source` is content too, unlike the process canonicaliser whose `EXCLUDED` drops it at every depth — do NOT reuse `canonical()`; write `fact_canonical(doc)` that copies the NFC-normalise + integral-float narrowing behaviour but takes its exclusions as a top-level-only tuple).
- `facts_store.load_index(root) -> dict`, `facts_store.load_entry(root, fact_id) -> dict | None` (scans the five files via the index row's kind).
- `routers/confirmations._kind(target)` returns `"fact"` for `^F-[0-9]{5}$` targets (test the regex, not `startswith` — a department named `F` must not collide); `_load` reads a fact target from `facts/`; POST on an entry whose derived `status` is `disputed`/`unknown` → 409 with detail «دادهٔ قرمز قابل تأیید نیست — اول تعارض یا بی‌پاسخی را رفع کنید».
- `_target_scope` gains a first branch: an `F-` target loads the entry — scoped → the gate must pass `confirm` on **every** department in `scope.departments` (a purpose-built loop calling `access.permits(conn, user, "confirm")` per department, emitting **no** `access.denied` row per miss); empty scope → `confirm` at `*`. Absent id → uniform 404.
- Migration `N+1` (append to `MIGRATIONS`): `ALTER TABLE confirmations ADD COLUMN data_repo_commit TEXT;` — `store/confirmations.set_confirmation` gains the parameter; the router fills it with `git -C {cfg.data_root} rev-parse HEAD` (a small helper beside `gitcommit.py`'s existing plumbing; empty string when the repo has no commits).

- [ ] **Step 1: Failing tests** (fixtures: extend `ui-backend/tests/conftest.py`'s `data_root` to also create `facts/` with the five files + index containing two entries — one green-able cooking-scoped rule `F-00001`, one disputed universal record `F-00002`; hand-written JSON here is the served fixture, matching how `process.cooking-001.json` is seeded — the merge-only rule binds the live store, not test fixtures):

```python
def test_fact_fingerprint_drops_updated_at_top_level_only(): ...
    # two docs differing only in envelope updated_at → equal prints;
    # differing in data.updated_at (a record column) → different prints;
    # differing in source[] → different prints (source is content).
def test_kind_is_fact_for_F_ids(): ...
def test_tick_then_store_rewrite_reads_as_not_confirmed(data_root, tmp_path): ...
    # POST with echoed fingerprint → 200; rewrite facts/rules.json fixture on disk
    # (simulating a merge); GET list → confirmed false for that id.
def test_retick_stale_fingerprint_409(...): ...
def test_tick_on_red_entry_409(...): ...          # F-00002
def test_scoped_fact_needs_confirm_on_every_department(...): ...
    # cooking-only editor on an entry scoped to ["cooking","accounting"] → 404/403 per matrix
def test_universal_fact_needs_star(...): ...
def test_absent_id_uniform_404(...): ...
def test_commit_id_column_written_at_set_time(...): ...
```

- [ ] **Step 2–5:** FAIL → implement → PASS (also rerun `ui-backend/tests/test_confirmations_api.py` and `test_fingerprint.py` — the process paths must be untouched) → commit `feat(facts): fact confirmations — canonicaliser, gate, commit column`.

### Task 18: `facts_store` bundles — resolved, row_titles, path_labels, red paths, consumers, coverage

**Files:**
- Modify: `ui-backend/inja_ui_backend/facts_store.py`
- Create: `ui-backend/inja_ui_backend/store/manifest.py` (`read_manifest(root) -> dict`, `branches(root) -> list`, `workbook_count(root) -> int`)
- Test: `ui-backend/tests/test_facts_store.py`

**Interfaces (consumed verbatim by Task 19 and by the UI):**

```python
def red_paths(entry) -> dict:        # {"unknown": [paths], "disputed": [paths]}
def resolved_map(root, entry) -> dict:   # every {ref} target id, refItems item key,
                                         # and processes[] id → {"kind","title","code"?}
def row_titles(root, entry) -> dict      # row key → title (reference rows composed from
                                         # refItems titles in primaryKey order)
def path_labels(root, entry) -> dict     # every red path, account field, reconciled cell
                                         # → "ستون — ردیف" Persian label
def consumers(root, fact_id) -> list     # [{"id","title"}] — entries whose inputs[].from,
                                         # via, calls[], writes_to, fields[].derived,
                                         # refItems cells or reconciled_against name it
def process_links(root, entry) -> list   # [{"ref","title","tombstoned","heir"}] read live
                                         # from departments/** (QF-8 §2)
def coverage(root) -> dict               # {"read": n, "total": m} — manifest workbooks
                                         # cited by at least one non-stub record
```

- [ ] **Step 1: Failing test** — the load-bearing assertion is spec §17's closing ui-backend bullet, written as one test: build a fixture store containing a reference record with `refItems` rows, a rule reading it, a measurement writing to it, a disputed cell and a `null` cell; assert that the union of `resolved_map` keys, `row_titles` keys and `path_labels` keys covers **every** id, item key, row key and red path reachable from each entry — so no screen can fall back to a raw key. Plus: `consumers` finds the rule from the record via all seven edge kinds (one sub-test each); `process_links` marks a tombstoned process with its heir; `coverage` counts cited workbooks only.
- [ ] **Step 2–5:** FAIL → implement (walks reuse `iter_ref_objects`'s shape test — reimplement locally in `facts_store.py`; ui-backend must not import the engine package) → PASS → commit `feat(facts): served bundles — resolved, row_titles, path_labels, consumers`.

### Task 19: Read routes, visibility switches, disclosure

**Files:**
- Create: `ui-backend/inja_ui_backend/routers/facts.py`
- Modify: `ui-backend/inja_ui_backend/app.py` (include router), `visibility.py`, `disclosure.py`, `store/policy.py`, `ui-backend/tests/test_endpoint_matrix.py`, `ui-backend/tests/test_policy_store.py`
- Test: `ui-backend/tests/test_facts_api.py`

**Interfaces:**
- `GET /api/facts` — the list. Gated like the confirmations list (session + Panel capability on a scope; a `view`-only holder gets the uniform 404 on **every** facts route — facts are not in the reader view, §18). Response rows: `{id, kind, key, title, aliases, scope, status, retired, stub, red_counts: {unknown, disputed}, confirmed: bool, updated_at}` — confirmation state computed server-side from stored fingerprints (`stored_for`-style batch); an admin (non-editor) receives only entries with a valid confirmation (`may_serve`) and only kinds whose switch is on; universal entries pass the scope filter via the explicit `scope.departments == []` disjunct. Query params `?consumes=F-…` and `?process=…` filter through Task 18's reverse walks. The response envelope carries `{"entries": [...], "coverage": {"read": n, "total": m}}`.
- `GET /api/facts/branches` — from `store/manifest.py`.
- `GET /api/facts/{fid}` — the bundle: `{entry, confirmation: {confirmed, can_confirm}, red_paths, resolved, row_titles, path_labels, consumers, processes}` after `visibility.filtered`'s fact branch (kind switch off → uniform 404 for a non-editor; `fact_sources` off → `source[]` and `accounts[].source` stripped).
- `store/policy.py`: `FIELDS` grows the six `fact_items, fact_records, fact_measurements, fact_rules, fact_notes, fact_sources`, all defaulting **True** (shown); `test_policy_store`'s exact-table pin updates 6 → 12.
- `visibility.filtered` gains a `fact` branch (a fact doc is recognised by its `F-` id + `kind` in the five) applying the switches; `disclosure.may_serve` accepts a fact entry + its confirmation row.

- [ ] **Step 1: Failing tests** — the §17 gate matrix for facts: all-departments AND; universal at `*`; uniform 404 for `view`-only on every facts route; an admin's list omits unconfirmed entries and off-kinds; with `fact_sources` off the served entry carries no `source[]`; `?consumes` returns the consuming rule; the endpoint-matrix rows added to `GATED`/`FILTERED` (list route in `FILTERED`, detail in `GATED` with a callable target) pass the whole existing matrix.
- [ ] **Step 2–5:** FAIL → implement → PASS (rerun `test_policy_store.py`, `test_endpoint_matrix.py`) → commit `feat(facts): facts read routes, visibility switches, may_serve`.

### Task 20: The resolve write route and the source download

**Files:**
- Modify: `ui-backend/inja_ui_backend/routers/facts.py`, `ui-backend/inja_ui_backend/engine.py` (add `merge_facts_resolve(cfg, fact_id, field, account, run_dir)` and `facts_run_dir(cfg, dept) -> Path` — creates `runs/facts/{dept}/{stamp}/` + `meta.json` with `origin: "ui"`, the actor, ISO stamps), `ui-backend/inja_ui_backend/models.py` (`ResolveFactBody {field: str, account: str}`)
- Test: `ui-backend/tests/test_facts_write_and_download.py`

**Interfaces:**
- `POST /api/facts/{fid}/resolve` — gated `edit` on the entry's scope (same AND helper as Task 17); body `ResolveFactBody`; creates the run dir, shells `merge facts resolve --id … --field … --account … --run …` through `engine.py`, maps `EngineError` → 422 with the engine's message, commits DATA_ROOT via `gitcommit`, returns the re-served bundle. The service never edits `facts/*.json` itself.
- `GET /api/facts/source?path=<data-repo-relative>` — capability `export_pdf` (the download split), plus the same Panel gate as the entry routes; containment: the resolved path must be inside one of exactly three roots — `attachments/sheets/`, `departments/{dept}/attachments/`, `meetings/transcripts/` — `resolve()`-both-sides (mirror `export_files.serve_export`'s idiom, including the try/except and the bare 404); response is `FileResponse` with `content-disposition: attachment` (never inline — QF-39: nothing is rendered); with `fact_sources` off for the caller → uniform 404.

- [ ] **Step 1: Failing tests** — resolve: a disputed fixture entry + a stubbed engine (monkeypatch `engine._run` to write the store change a real resolve would, then assert the run dir's `meta.json` has `origin: "ui"` and the response bundle shows the field confirmed); engine exit 2 → 422 with the stderr text; a `view`-only holder → 404; an `edit`-holder outside scope → 404. Download: a path under each of the three roots → 200 with `attachment` disposition; `../` traversal and an absolute path → 404; a transcript is never streamed inline (`content-disposition` asserted); `fact_sources` off → 404; no `export_pdf` → 403 + `access.denied` audit row (mirroring `export_files`).
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat(facts): resolve via engine run dir; gated source download`.

---

# Phase 4 — UI (code-repo)

**DESIGN LAW applies to every task below** (Global Constraints): the facts section of `ui/design/Inja Panel.dc.html` is the single visual and behavioural authority, corrected only by the ten conformance notes at the end of spec §14. Build what the design shows, exactly as it shows it. If a spec/plan requirement has **no home in the design** — no screen, no control, no state drawn for it — **STOP and ask the user first**. Two known instances where this rule already bites, resolved in advance so no one re-asks: the design *does* have homes for the confirm tick, the disabled red tick, the account chooser, the filters, the clear-filters link and the source rows (download popup reuses the design's `factAsk` confirm-dialog pattern with the Appendix D copy «فایل منبع دانلود شود؟»); the design has **no** raw-JSON view and **no** «متن اصلی» block — those two are exactly the consult-the-user case: ask before building them, and ship the rest of their task without them if the user defers.

Every task ends with two runs: `npx vitest run <scoped filter>` (unit + guards) and `npx playwright test e2e/<spec> --project=w1440` during iteration, then all three width projects (`npx playwright test e2e/<spec>`) before commit. Playwright specs stub the API with `serve()` using fixtures **derived from `ui/design/mock/facts/api/*.json`** — the mock set built for the design covers every kind and state; trim each fixture to the rows the test needs and type it against `api/types.ts` so schema drift is a `tsc` error.

### Task 21: Design audit, labels, types, hooks

**Files:**
- Create: `ui/src/lib/factsLabels.ts`, `ui/src/lib/factsLabels.test.ts`
- Modify: `ui/src/api/types.ts`, `ui/src/api/hooks.ts`
- Create: `docs/superpowers/plans/facts-design-audit.md` (working notes: the audit table)

- [ ] **Step 1: The design audit.** Open `ui/design/Inja Panel.dc.html`, isolate the facts section (markup ≈ lines 998–1780: `FACTS LIST`, `FACT DETAIL`, `FACT CONFIRM DIALOG` comments; logic ≈ lines 4624–5090). Produce `facts-design-audit.md`: (a) a table of every screen region → the design's exact values (colors, radii, font sizes, paddings, grid tracks — e.g. the list grid `1.7fr .8fr .9fr 1.1fr 1.1fr 34px`, the card shadow `0 1px 2px rgba(16,10,40,.16),0 14px 30px -16px rgba(16,10,40,.55)`, chip colors `#1F8A5B`/`#E8A33D`); (b) the list of design tokens these map to in `src/styles/tokens.css` — any value with no token goes on an `UNTOKENISED` candidates list for the owner, per `guards.test.ts`'s process, **not** invented; (c) the conformance-notes deltas restated as concrete component requirements (two-value chip + red counts + badges; served titles not `KEY_FA`; `red_paths`-only red; `may_serve` for admins; no bidi mix in «محل»; accounts grouped by field with `speaker_role`; all four orphan classes; `field_status` markers; labels from `factsLabels.ts`; no «کاربرگ‌ها» blocks). This file is the reference every later task builds from — numbers come from here, never from memory.
- [ ] **Step 2: `factsLabels.ts`** — transcribe spec Appendix D **verbatim and completely**: one exported map per enumeration keyed by the English stored value (`KIND_LABELS`, `KIND_SHAPE_LABELS`, `FIELD_STATUS_LABELS`, `CONFIRMATION_LABELS`, `BADGE_LABELS`, `CATEGORY_LABELS`, `STATE_LABELS`, `MEDIUM_LABELS`, `ROLE_LABELS_RECORD`, `CADENCE_LABELS`, `FIELD_TYPE_LABELS`, `QUANTITY_LABELS`, `NATURE_LABELS`, `LANG_LABELS`, `HIT_LABELS`, `AGGREGATE_LABELS`, `DIVERGENCE_LABELS`, `ACCOUNT_STATUS_LABELS`, `ISSUE_KIND_LABELS`, `FIX_OP_LABELS`, `SOURCE_TYPE_LABELS`, `FROM_LITERAL_LABELS`, `ORIGIN_LABELS`), one `ENVELOPE_FIELD_LABELS` + `PAYLOAD_FIELD_LABELS` map, the screen/action strings (`SCREEN_LABELS`: section name, coverage line template, orphan classes, confirm/revoke/choose/download-popup strings, filters, the confirm-dialog copy, the section headings table), and `label(map, value)` that **throws in development** (`import.meta.env.DEV`) on a missing key and falls back to the raw value in production. Shape follows `lib/roles.ts` (map + accessor), per conformance note 9.
- [ ] **Step 3: The coverage test** `factsLabels.test.ts` — reads `../../../schemas/facts.schema.json`, `manifest.schema.json`, `facts-run-meta.schema.json` (via vite `?raw` import or `fs` in vitest's node context), walks every `enum` and `const` under them, and asserts each member has a label in the union of the exported maps; plus `label()` throws on an unknown value in dev. Run `npx vitest run factsLabels` — FAIL until the maps are complete, then PASS.
- [ ] **Step 4: Types + hooks.** `api/types.ts`: `FactKind`, `FactScope`, `FactSource`, `FactAccount`, `FactIssue`, `FactEntry` (envelope + `data: Record<string, unknown>` with typed per-kind narrowings `ItemData`/`RecordData`/`MeasurementData`/`RuleData`), `FactListRow` (the Task 19 row incl. `red_counts`, `confirmed`, `stub`), `FactBundle` (`entry, confirmation, red_paths, resolved, row_titles, path_labels, consumers, processes`), `FactsListResponse` (`entries, coverage`), `Branch`. `api/hooks.ts`: `useFacts()`, `useFact(id)`, `useFactBranches()`, `useResolveFact(id)` (mutation posting `{field, account}`, invalidating `['facts']` and `['fact', id]`), reusing `fetchJson` + `retryQuery`. Unit-test the hook wiring shape with the existing hook-test pattern if one exists; otherwise types compile + Task 22's specs cover them.
- [ ] **Step 5: Commit** — `feat(facts): labels, types, hooks + design audit notes`.

### Task 22: The facts list screen

**Files:**
- Create: `ui/src/facts/FactsList.tsx`, `ui/src/facts/factsFilter.ts`, `ui/src/facts/factsFilter.test.ts`, `ui/src/facts/FactsList.test.tsx`
- Modify: `ui/src/routes.tsx` (`/facts` under `RequireAuth`), `ui/src/shell/PanelShell.tsx` (tray link «داده‌های کمّی» beside «دپارتمان‌ها», active/inactive treatment + mobile sheet row), `ui/src/shell/crumbs.ts` (FLAT entry), `ui/e2e/_harness.ts` (a new `facts` DESIGN row), `ui/src/test/guards.test.ts` (ISLANDS: `'src/facts/FactsList.tsx'`)
- Create: `ui/e2e/facts.spec.ts`

Build exactly the design's list: title header on the purple ground; one white card containing the search input («جست‌وجوی عنوان داده…»), the four `Dropdown` filters (نوع / دپارتمان / شعبه / وضعیت تأیید — options from `factsLabels` + `useFactBranches` + the department registry, **not** hard-coded maps), the design's «پاک کردن همهٔ فیلترها» link shown only when any filter/search is active, the grid header (عنوان / شناسه / نوع / دپارتمان / وضعیت), and the rows: title; mono LTR id; kind label (with shape suffix per `KIND_SHAPE_LABELS`); scope line (dept · branch titles, «کل سامانه» for universal); the **two-value** chip with dot + per conformance note 1 the red counts beside it («{n} بی‌پاسخ · {n} متعارض» in `toFa` digits) and «پیش‌ثبت»/«بازنشسته» badges; chevron. Coverage line («{n} از {m} کاربرگ خوانده شده», from the list response) in the list header area per the spec amendment — its designed home is the list card header; empty-filter state string from the design («با این فیلترها داده‌ای نیست»). Client-side filtering lives in `factsFilter.ts` (pure, unit-tested: kind/dept incl. `__u` universal/branch/confirmation/search over title + id + aliases).

- [ ] **Step 1: Failing unit tests** — `factsFilter.test.ts` (each predicate + `anyActive`); `FactsList.test.tsx` (renders rows from a typed fixture; red counts shown for a red row; stub badge shown; clear-filters link absent until a filter is active).
- [ ] **Step 2:** `npx vitest run src/facts` — FAIL. **Step 3:** implement. **Step 4:** `npx vitest run src/facts guards` — PASS (ISLANDS updated, no token violations).
- [ ] **Step 5: The Playwright spec** `ui/e2e/facts.spec.ts` — `signedIn(page)`, `serve(page, {'/api/facts': <typed fixture from the mock set>, '/api/facts/branches': [...], ...shell endpoints})`, `visit(page, '/facts', 'facts')`; assert: `expectDesign(page, 'facts')` (the DESIGN row you added, numbers from the Task 21 audit — grid tracks, chip colors, card radius/shadow); the four filters open and filter; the confirmation filter's two values only; a red row shows its counts; `shot()` baselines at all three widths. Run `npx playwright test e2e/facts.spec.ts` — PASS.
- [ ] **Step 6: Commit** — `feat(facts): the داده‌های کمّی list screen to design`.

### Task 23: The fact detail screen — five kinds

**Files:**
- Create: `ui/src/facts/FactDetail.tsx` (screen shell: header chips, tick, statement card, sources/processes/consumers card, footer id|key|updated chip), `ui/src/facts/cards/{RuleCard.tsx, RecordCard.tsx, ItemCard.tsx, MeasurementCard.tsx, NoteCard.tsx, LifecycleCard.tsx, AccountsCard.tsx, IssuesCard.tsx}`, `ui/src/facts/FactConfirm.tsx` (the tick + dialog, wrapping `ConfirmAction`'s API pattern with the red-disabled case), `ui/src/facts/SourceRow.tsx` (the download-popup flow), co-located `*.test.tsx` per card
- Modify: `ui/src/routes.tsx` (`/facts/:id`), `ui/src/shell/crumbs.ts`, `ui/e2e/_harness.ts` (a `factDetail` DESIGN row), `ui/src/test/guards.test.ts` (ISLANDS: the detail files that pin `dir`)
- Create: `ui/e2e/fact-detail.spec.ts`

Content per kind, exactly the design's cards and order, fed from the served bundle (never `KEY_FA`-style dictionaries — conformance note 2):
- **rule**: formula island card (`expr`, LTR mono); constant big-number card with «به ازای هر …» and nature chip; inputs/outputs pair («چه چیزهایی لازم دارد / چه چیزی می‌سازد») using `inputs[].title`/`outputs[].title`, unit chips, share chips, `from`/`writes_to`/`of`/`via` links through `resolved`; decision table (Persian cells per the design's 22:44 save, «در غیر این صورت» default row); «فراخوانی‌ها» chips; edge-cases table «موارد خاص»; `port` badge; template/divergence row; identifier row.
- **record**: reference grid with per-cell colour from `red_paths` **only** (note 3), refItems cells showing resolved titles (key as tooltip), row-key column hidden when `primaryKey` composes it; columns card for grid-less records with «واحد ثبت نشده» **only where `unit` is present-and-null**; printed-rows card «قلم‌های چاپ‌شده روی فرم»; «ساختار و مکان جدول» card (محل without the bidi-mixed id — note 6: the spreadsheet id lives only in the footer chip), grain/cadence/pk/approver/header-fields/sections/signatures/movement/mirror/FK/reconciled rows.
- **item**: code + category chip + base unit header row; pack; group/grade/state; pack-units chips with ranged `factor_to_base` (`۰٫۲۸–۰٫۳۲`); tracked rows.
- **measurement**: the 2×2 grid (کمیت و واحد / برای / زمان·توسط / ثبت در — the writes-to cell shows the record's **title** + column **title** from `resolved`, id as tooltip), method, exceptions.
- **note**: statement + sources only.
- Cross-kind: lifecycle card («اعتبار زمانی», بسته‌شده, supersedes links); accounts card **grouped by disputed field under its `path_labels` label with `speaker_role`** (note 4), «انتخاب این روایت» → `useResolveFact` behind the design's confirm dialog; issues card with `from_date`/`fix`/`affects` (note 8); `field_status` markers «استنباطی»/«عرفی» on their fields (note 8); process links with the tombstone/node-gone/moved-source orphan classes (note 7, labels from Appendix D); consumers chips; sources card where every file-backed row opens the download popup («فایل منبع دانلود شود؟» → `GET /api/facts/source?path=…` via a programmatic `<a download>`), `process` rows navigate, `chat` rows inert. The tick: `FactConfirm` reuses the confirmations API exactly as `ConfirmAction` (echoed fingerprint, 409 copy), adds the disabled state «قابل تأیید نیست» for red entries and no control for universal-without-`*`/stub/retired. The raw-JSON view and «متن اصلی» block: **consult the user first** (see the phase preamble).

- [ ] **Step 1: Failing unit tests per card** — for each: render from a typed mock-derived fixture and assert the conformance-note behaviours (RecordCard: a present-and-null unit is red, an omitted unit is not; a refItems cell shows the resolved title; AccountsCard: grouped under the path label, speaker_role shown; FactConfirm: red → disabled with the exact label; SourceRow: click opens the dialog with the file name, confirm triggers the download URL).
- [ ] **Step 2:** `npx vitest run src/facts` — FAIL. **Step 3:** implement. **Step 4:** PASS incl. `guards`.
- [ ] **Step 5: Playwright** `ui/e2e/fact-detail.spec.ts` — fixtures for at least: the disputed rule (accounts + resolve flow — stub the POST and assert the invalidation refetch), the BOM record (grid cell colours), the paper record (printed rows + null units), the constant (big number), the item (ranged factor), the measurement, a stub and a retired entry (badges, no tick), a tombstoned process link (heir named), plus `expectDesign(page, 'factDetail')` and `shot()`s. Run all three widths — PASS.
- [ ] **Step 6: Commit** — `feat(facts): fact detail — five kinds to design`.

### Task 24: Conformance closure

**Files:**
- Modify: `ui/e2e/sweep.spec.ts` (facts screens join the cross-screen sweep), `ui/src/test/guards.test.ts` (final ISLANDS/UNTOKENISED state), `docs/superpowers/plans/facts-design-audit.md` (closure table)
- Test: full scoped suites

- [ ] **Step 1:** The closure table: for each of the ten conformance notes, name the test that pins it (unit or e2e) — any note without a pinned test gets one now.
- [ ] **Step 2:** `npx vitest run src/facts src/lib/factsLabels guards` — PASS.
- [ ] **Step 3:** `npx playwright test e2e/facts.spec.ts e2e/fact-detail.spec.ts e2e/sweep.spec.ts` — PASS at w1440/w1080/w760.
- [ ] **Step 4:** Local stack check: `npm --prefix ui run build`, then (if the local compose stack is up) restart `ui-backend` and click through the section against a seeded fixture `DATA_ROOT` — the bind-mount serves `ui/dist`, no image rebuild.
- [ ] **Step 5: Commit** — `feat(facts): conformance closure — sweep, guards, audit table`.

---

## Self-review checklist (run after writing, before handoff)

- Spec coverage: QF-1…QF-45 each map to a task (QF-1/9/14 → Task 1 + the agent prompt in Task 14; QF-2/17 → 3–5; QF-3/28/29 → 10, 16; QF-4/15/16/32/33/34/43 → 3, 5; QF-5/6/7/36/37/40/41 → 1, 3, 9; QF-8 → 12, 15, 18; QF-10/11 → 1, 10, 14; QF-12/31/35/45 → 1, 5, 6; QF-13 → 6, 8; QF-19/20/38 → 14, 15; QF-21 → 2; QF-22/25/42 → 21–24; QF-23/26/27 → 17, 19; QF-24 → 17; QF-30 → 11; QF-39 → 20, 23; QF-44 → 8, 16). The acceptance fixtures of §17 (classification + cooking PDF) are **agent-quality tests, not code tests** — they land in Task 14's skill as the written classification test the agent is measured against; automating them is future work, deliberately out of this plan.
- Placeholder scan: the only deliberate deferrals are named consult-the-user items (raw JSON view, «متن اصلی») and the §17 agent fixtures above — no TBDs elsewhere.
- Type consistency: `merge_entry`, `apply`, `resolve/retire/promote/export/revert/audit/check`, `fact_fingerprint`, `load_entry`, `entry bundle` field names (`red_paths`, `resolved`, `row_titles`, `path_labels`, `consumers`, `coverage`), and the route/response shapes are each defined once in their task's Interfaces block and consumed by name downstream — if an executor renames one, its consumer task's tests fail by design.
