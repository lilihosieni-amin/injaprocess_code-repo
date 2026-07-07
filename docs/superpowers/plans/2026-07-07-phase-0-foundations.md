# Phase 0 — Foundations & Data Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the system's shared JSON data contract machine-checkable — JSON Schemas for every data shape, golden fixtures that validate against them, and a one-command test harness — so every later phase (engine CLIs, bots, UI) builds against a frozen, verified contract.

**Architecture:** JSON Schema (draft 2020-12) files live in `code-repo/schemas/` because they are the contract *enforced by code* (the `merge` CLI and the UI backend validate against them; INV-2 keeps them out of runtime's reach). Golden fixtures live in `code-repo/tests/fixtures/` as test oracles. A pytest suite validates each fixture against its schema (positive) and asserts a deliberately-broken copy is rejected (negative). A `Makefile` provides `make test` / `make lint` over a self-provisioning `.venv`.

**Tech Stack:** Python 3.12 (ARD floor 3.11+), `jsonschema` (Draft202012Validator), `pytest`, `ruff`. No application/runtime dependencies — this phase is contract + tooling only.

## Global Constraints

- **Python:** 3.11+ (dev machine has 3.12.3). Copy exact values; no `Date.now()`-style nondeterminism in fixtures.
- **JSON Schema dialect:** draft 2020-12 — every schema's `$schema` is `https://json-schema.org/draft/2020-12/schema`.
- **Schema location:** `code-repo/schemas/*.schema.json` (NOT `data-repo`). Refines PLAN.md §2 wording.
- **Fixture location:** `code-repo/tests/fixtures/*.json`.
- **Stored data is ISO + Latin digits.** Persian numerals and Jalali dates are UI-only presentation (Phase 6); fixtures use ISO-8601 UTC timestamps (`2026-07-06T10:00:00Z`) and Latin digits in all machine fields. Persian **display strings** (names, labels) are fine as content.
- **No secrets** anywhere in either repo (CLAUDE.md rule, ARD §14).
- **IDs** follow ARD §4.1: process `^[a-z]+-[0-9]{3}$`, box `^[a-z]+-[0-9]{3}-n[0-9]{3}$`, junction `^[a-z]+-[0-9]{3}-j[0-9]+$`. (Phase 0 only encodes these in schemas; generation is Phase 1's `allocate-id`.)
- **data-repo already exists** as a sibling (`../data-repo`, git repo, commit `84079d7`) with the ARD §2.2 skeleton and a real `registry.json`. Do not recreate it; reference it.

**Contract-freeze ordering note:** Tasks 2–5 (registry, process, candidate, delta) are the schemas Phase 1's engine CLIs consume — do these first. Tasks 6–9 (overview, segments, run meta, conflicts) are consumed by the Phase-3 brain and may be done later without blocking Phase 1, but are included here to freeze the whole contract at once.

---

### Task 1: Dev tooling & test harness

**Files:**
- Create: `requirements-dev.txt`
- Create: `pyproject.toml`
- Create: `Makefile`
- Create: `schemas/.gitkeep`
- Create: `tests/conftest.py`
- Create: `tests/fixtures/.gitkeep`
- Create: `tests/test_harness_smoke.py`
- Modify: `.gitignore` (add `.venv/`, `__pycache__/`, `.pytest_cache/`, `.ruff_cache/`)

**Interfaces:**
- Produces: a pytest fixture `validate(schema_name, instance) -> list[error]` and a helper `load_fixture(name) -> obj`, both importable by every later task's tests via `conftest.py`.

- [ ] **Step 1: Create dev requirements**

`requirements-dev.txt`:
```
pytest~=8.3
jsonschema~=4.23
ruff~=0.6
```

- [ ] **Step 2: Create project config**

`pyproject.toml`:
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I"]
```

- [ ] **Step 3: Create the Makefile**

`Makefile` (note: recipe lines are TAB-indented):
```make
VENV := .venv
BIN  := $(VENV)/bin

$(VENV): requirements-dev.txt
	python3 -m venv $(VENV)
	$(BIN)/pip install -q -U pip
	$(BIN)/pip install -q -r requirements-dev.txt
	touch $(VENV)

.PHONY: test
test: $(VENV)
	$(BIN)/pytest -q

.PHONY: lint
lint: $(VENV)
	$(BIN)/ruff check .

.PHONY: clean
clean:
	rm -rf $(VENV) .pytest_cache .ruff_cache
```

- [ ] **Step 4: Create the shared test helper**

`tests/conftest.py`:
```python
import json
import pathlib

import pytest
from jsonschema import Draft202012Validator

REPO = pathlib.Path(__file__).resolve().parents[1]
SCHEMA_DIR = REPO / "schemas"
FIXTURE_DIR = pathlib.Path(__file__).resolve().parent / "fixtures"


def load_json(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_fixture(name: str):
    return load_json(FIXTURE_DIR / name)


@pytest.fixture
def validate():
    """Return a function (schema_name, instance) -> list of validation errors.

    Empty list means the instance conforms to the schema.
    """
    def _validate(schema_name: str, instance):
        schema = load_json(SCHEMA_DIR / schema_name)
        Draft202012Validator.check_schema(schema)  # schema itself must be valid
        v = Draft202012Validator(schema)
        return sorted(v.iter_errors(instance), key=lambda e: list(e.path))
    return _validate
```

Also make helpers importable in tests by exposing them at module import (they already are, via `from conftest import load_fixture` since pytest adds the test dir to `sys.path`).

- [ ] **Step 5: Create the smoke test**

`tests/test_harness_smoke.py`:
```python
from conftest import FIXTURE_DIR, SCHEMA_DIR


def test_dirs_exist():
    assert SCHEMA_DIR.is_dir()
    assert FIXTURE_DIR.is_dir()
```

- [ ] **Step 6: Add tooling ignores to `.gitignore`**

Append to `code-repo/.gitignore`:
```
.venv/
__pycache__/
.pytest_cache/
.ruff_cache/
```

- [ ] **Step 7: Run the harness**

Run: `make test`
Expected: venv is created, deps install, pytest collects `test_dirs_exist` → **PASS** (1 passed).

- [ ] **Step 8: Commit**

```bash
git add requirements-dev.txt pyproject.toml Makefile schemas/.gitkeep tests/conftest.py tests/fixtures/.gitkeep tests/test_harness_smoke.py .gitignore
git commit -m "chore(phase0): dev tooling + schema test harness"
```

---

### Task 2: registry schema

**Files:**
- Create: `schemas/registry.schema.json`
- Create: `tests/fixtures/registry.json` (copy of `../data-repo/departments/registry.json`)
- Create: `tests/test_registry_schema.py`

**Interfaces:**
- Consumes: `validate`, `load_fixture` from Task 1.
- Produces: `registry.schema.json` — the shape Phase 1 `allocate-id`/upload-bot validate department codes against.

- [ ] **Step 1: Write the failing test**

`tests/test_registry_schema.py`:
```python
from conftest import load_fixture

SCHEMA = "registry.schema.json"


def test_real_registry_is_valid(validate):
    assert validate(SCHEMA, load_fixture("registry.json")) == []


def test_department_requires_code_and_name(validate):
    bad = {"departments": [{"code": "cooking"}]}  # missing name
    assert validate(SCHEMA, bad) != []


def test_rejects_unknown_top_level_key(validate):
    bad = {"departments": [], "extra": 1}
    assert validate(SCHEMA, bad) != []
```

- [ ] **Step 2: Create the fixture**

`tests/fixtures/registry.json` — identical content to `../data-repo/departments/registry.json`:
```json
{
  "departments": [
    { "code": "management",  "name": "مدیریت" },
    { "code": "accounting",  "name": "حسابداری" },
    { "code": "warehouse",   "name": "انبار" },
    { "code": "procurement", "name": "کارپردازی" },
    { "code": "cooking",     "name": "پخت" },
    { "code": "preparation", "name": "آماده‌سازی" },
    { "code": "dining",      "name": "سالن" },
    { "code": "cashier",     "name": "صندوق" },
    { "code": "logistics",   "name": "لجستیک" }
  ]
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `make test`
Expected: FAIL — `schemas/registry.schema.json` does not exist (validator raises FileNotFoundError).

- [ ] **Step 4: Write the schema**

`schemas/registry.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "registry.schema.json",
  "title": "Department registry (ARD §4.5)",
  "type": "object",
  "additionalProperties": false,
  "required": ["departments"],
  "properties": {
    "departments": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["code", "name"],
        "properties": {
          "code": { "type": "string", "pattern": "^[a-z]+$" },
          "name": { "type": "string", "minLength": 1 }
        }
      }
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `make test`
Expected: PASS (registry tests + smoke).

- [ ] **Step 6: Commit**

```bash
git add schemas/registry.schema.json tests/fixtures/registry.json tests/test_registry_schema.py
git commit -m "feat(phase0): registry schema + fixture"
```

---

### Task 3: process schema (the core contract)

**Files:**
- Create: `schemas/process.schema.json`
- Create: `tests/fixtures/process.cooking-001.json`
- Create: `tests/test_process_schema.py`

**Interfaces:**
- Consumes: `validate`, `load_fixture`.
- Produces: `process.schema.json` — the shape the `merge` CLI writes and the UI backend reads/writes. `$defs`: `icom`, `kpi`, `position`, `nodeSource`, `activityNode`, `terminalNode`, `junctionNode`, `edge`, `pending`.

- [ ] **Step 1: Write the failing test**

`tests/test_process_schema.py`:
```python
import copy

from conftest import load_fixture

SCHEMA = "process.schema.json"


def test_golden_process_is_valid(validate):
    assert validate(SCHEMA, load_fixture("process.cooking-001.json")) == []


def test_bad_process_id_rejected(validate):
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    p["id"] = "Cooking_1"  # violates ^[a-z]+-[0-9]{3}$
    assert validate(SCHEMA, p) != []


def test_junction_requires_junction_type(validate):
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    for n in p["nodes"]:
        if n["type"] == "junction":
            del n["junctionType"]
    assert validate(SCHEMA, p) != []


def test_activity_extra_field_rejected(validate):
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    for n in p["nodes"]:
        if n["type"] == "activity":
            n["surprise"] = True
            break
    assert validate(SCHEMA, p) != []


def test_pending_original_value_untouched_shape(validate):
    # pending rows carry current + proposed + status (FR-M3)
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    p["pending"][0]["status"] = "banana"  # not in enum
    assert validate(SCHEMA, p) != []
```

- [ ] **Step 2: Create the golden fixture**

`tests/fixtures/process.cooking-001.json`:
```json
{
  "id": "cooking-001",
  "department": "cooking",
  "name": "خرید و پرداخت هزینه",
  "summary": "از دریافت درخواست خرید تا پرداخت نهایی به تأمین‌کننده و بایگانی رسید.",
  "source": { "type": "voice", "ref": "cooking-2026-07-06", "run": "runs/cooking-2026-07-06" },
  "parent": null,
  "created_at": "2026-07-06T10:00:00Z",
  "updated_at": "2026-07-06T10:00:00Z",
  "idef0": {
    "inputs": ["درخواست خرید"],
    "controls": ["بودجهٔ ماهانه", "سیاست خرید"],
    "outputs": ["کالای خریداری‌شده", "فاکتور پرداخت‌شده"],
    "mechanisms": ["کارپرداز", "حسابدار", "مدیر"]
  },
  "kpis": [
    { "name": "زمان چرخهٔ خرید", "definition": "از ثبت درخواست تا دریافت کالا", "target": "کمتر از ۳ روز", "unit": "روز" }
  ],
  "nodes": [
    { "id": "start", "type": "start", "label": "شروع", "position": { "x": 30, "y": 104 }, "layout": "auto" },
    {
      "id": "cooking-001-n010", "type": "activity", "label": "دریافت درخواست خرید",
      "description": "درخواست خرید از سرآشپز یا انباردار دریافت و در سامانه ثبت می‌شود.",
      "actor": "کارپرداز",
      "icom": { "inputs": ["درخواست شفاهی/کتبی"], "controls": ["سقف بودجهٔ ماهانه"], "outputs": ["درخواست ثبت‌شده"], "mechanisms": ["کارپرداز"] },
      "subprocess": null, "position": { "x": 150, "y": 90 }, "layout": "auto",
      "source": { "created_by": "runs/cooking-2026-07-06", "touched_by": [] }
    },
    { "id": "cooking-001-j1", "type": "junction", "junctionType": "XOR", "direction": "split", "position": { "x": 392, "y": 107 }, "layout": "auto" },
    {
      "id": "cooking-001-n060", "type": "activity", "label": "پرداخت هزینه",
      "description": "پرداخت به تأمین‌کننده انجام و رسید بایگانی می‌شود.",
      "actor": "حسابدار",
      "icom": { "inputs": ["سند حسابداری"], "controls": ["مجوز پرداخت"], "outputs": ["رسید پرداخت"], "mechanisms": ["حسابدار"] },
      "subprocess": "cooking-014", "position": { "x": 140, "y": 296 }, "layout": "manual",
      "source": { "created_by": "runs/cooking-2026-07-06", "touched_by": [] }
    },
    { "id": "end", "type": "end", "label": "پایان", "position": { "x": 150, "y": 430 }, "layout": "auto" }
  ],
  "edges": [
    { "from": "start", "to": "cooking-001-n010" },
    { "from": "cooking-001-n010", "to": "cooking-001-j1" },
    { "from": "cooking-001-j1", "to": "cooking-001-n060", "label": "نیاز به تأیید" },
    { "from": "cooking-001-n060", "to": "end" }
  ],
  "pending": [
    { "node": "cooking-001-n020", "field": "actor", "current": "مدیر رستوران", "proposed": "معاون مدیر", "source": "runs/cooking-2026-07-10", "status": "open" }
  ]
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `make test`
Expected: FAIL — `schemas/process.schema.json` missing.

- [ ] **Step 4: Write the schema**

`schemas/process.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "process.schema.json",
  "title": "IDEF0/IDEF3 process (ARD §4.3)",
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "department", "name", "summary", "source", "parent",
               "created_at", "updated_at", "idef0", "kpis", "nodes", "edges", "pending"],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" },
    "department": { "type": "string", "pattern": "^[a-z]+$" },
    "name": { "type": "string" },
    "summary": { "type": "string" },
    "source": {
      "type": "object", "additionalProperties": false,
      "required": ["type", "ref", "run"],
      "properties": {
        "type": { "enum": ["voice", "manual", "chat"] },
        "ref": { "type": ["string", "null"] },
        "run": { "type": ["string", "null"] }
      }
    },
    "parent": {
      "oneOf": [
        { "type": "null" },
        {
          "type": "object", "additionalProperties": false,
          "required": ["process", "node"],
          "properties": { "process": { "type": "string" }, "node": { "type": "string" } }
        }
      ]
    },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" },
    "idef0": { "$ref": "#/$defs/icom" },
    "kpis": { "type": "array", "items": { "$ref": "#/$defs/kpi" } },
    "nodes": { "type": "array", "items": { "$ref": "#/$defs/node" } },
    "edges": { "type": "array", "items": { "$ref": "#/$defs/edge" } },
    "pending": { "type": "array", "items": { "$ref": "#/$defs/pending" } }
  },
  "$defs": {
    "icom": {
      "type": "object", "additionalProperties": false,
      "required": ["inputs", "controls", "outputs", "mechanisms"],
      "properties": {
        "inputs": { "type": "array", "items": { "type": "string" } },
        "controls": { "type": "array", "items": { "type": "string" } },
        "outputs": { "type": "array", "items": { "type": "string" } },
        "mechanisms": { "type": "array", "items": { "type": "string" } }
      }
    },
    "kpi": {
      "type": "object", "additionalProperties": false,
      "required": ["name"],
      "properties": {
        "name": { "type": "string" },
        "definition": { "type": "string" },
        "target": { "type": "string" },
        "unit": { "type": "string" }
      }
    },
    "position": {
      "type": "object", "additionalProperties": false,
      "required": ["x", "y"],
      "properties": { "x": { "type": "number" }, "y": { "type": "number" } }
    },
    "nodeSource": {
      "type": "object", "additionalProperties": false,
      "required": ["created_by", "touched_by"],
      "properties": {
        "created_by": { "type": "string" },
        "touched_by": { "type": "array", "items": { "type": "string" } }
      }
    },
    "node": {
      "oneOf": [
        { "$ref": "#/$defs/activityNode" },
        { "$ref": "#/$defs/terminalNode" },
        { "$ref": "#/$defs/junctionNode" }
      ]
    },
    "activityNode": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "type", "label", "description", "actor", "icom",
                   "subprocess", "position", "layout", "source"],
      "properties": {
        "id": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}-n[0-9]{3}$" },
        "type": { "const": "activity" },
        "label": { "type": "string" },
        "description": { "type": "string" },
        "actor": { "type": "string" },
        "icom": { "$ref": "#/$defs/icom" },
        "subprocess": { "type": ["string", "null"] },
        "position": { "$ref": "#/$defs/position" },
        "layout": { "enum": ["auto", "manual"] },
        "source": { "$ref": "#/$defs/nodeSource" }
      }
    },
    "terminalNode": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "type", "label", "position", "layout"],
      "properties": {
        "id": { "enum": ["start", "end"] },
        "type": { "enum": ["start", "end"] },
        "label": { "type": "string" },
        "position": { "$ref": "#/$defs/position" },
        "layout": { "enum": ["auto", "manual"] }
      }
    },
    "junctionNode": {
      "type": "object", "additionalProperties": false,
      "required": ["id", "type", "junctionType", "direction", "position", "layout"],
      "properties": {
        "id": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}-j[0-9]+$" },
        "type": { "const": "junction" },
        "junctionType": { "enum": ["AND", "OR", "XOR"] },
        "direction": { "enum": ["split", "join"] },
        "position": { "$ref": "#/$defs/position" },
        "layout": { "enum": ["auto", "manual"] }
      }
    },
    "edge": {
      "type": "object", "additionalProperties": false,
      "required": ["from", "to"],
      "properties": {
        "from": { "type": "string" },
        "to": { "type": "string" },
        "label": { "type": "string" }
      }
    },
    "pending": {
      "type": "object", "additionalProperties": false,
      "required": ["node", "field", "current", "proposed", "source", "status"],
      "properties": {
        "node": { "type": "string" },
        "field": { "type": "string" },
        "current": {},
        "proposed": {},
        "source": { "type": "string" },
        "status": { "enum": ["open", "accepted", "rejected"] }
      }
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `make test`
Expected: PASS — all `test_process_schema` cases + prior tests green.

- [ ] **Step 6: Commit**

```bash
git add schemas/process.schema.json tests/fixtures/process.cooking-001.json tests/test_process_schema.py
git commit -m "feat(phase0): process schema + golden fixture"
```

---

### Task 4: candidate-graph schema (extract output, new process)

**Files:**
- Create: `schemas/candidate.schema.json`
- Create: `tests/fixtures/candidate.json`
- Create: `tests/test_candidate_schema.py`

**Interfaces:**
- Produces: `candidate.schema.json` — the LLM `extract` subagent's output for a NEW process (ARD §5.4). Nodes use **temporary keys** (`n1`, `n2`, `j1`), never final IDs (INV-1). `merge` consumes this and assigns real IDs.

- [ ] **Step 1: Write the failing test**

`tests/test_candidate_schema.py`:
```python
import copy

from conftest import load_fixture

SCHEMA = "candidate.schema.json"


def test_candidate_is_valid(validate):
    assert validate(SCHEMA, load_fixture("candidate.json")) == []


def test_final_id_shape_still_allowed_as_temp_key(validate):
    # temp keys are free-form strings; the point is merge assigns real ids later
    c = copy.deepcopy(load_fixture("candidate.json"))
    c["nodes"][0]["key"] = "n99"
    assert validate(SCHEMA, c) == []


def test_missing_process_name_rejected(validate):
    c = copy.deepcopy(load_fixture("candidate.json"))
    del c["process_name"]
    assert validate(SCHEMA, c) != []
```

- [ ] **Step 2: Create the fixture**

`tests/fixtures/candidate.json`:
```json
{
  "department": "cooking",
  "process_name": "خرید و پرداخت هزینه",
  "summary": "از دریافت درخواست خرید تا پرداخت نهایی.",
  "idef0": {
    "inputs": ["درخواست خرید"], "controls": ["بودجهٔ ماهانه"],
    "outputs": ["کالای خریداری‌شده"], "mechanisms": ["کارپرداز"]
  },
  "kpis": [],
  "nodes": [
    { "key": "n1", "type": "activity", "label": "دریافت درخواست خرید", "description": "", "actor": "کارپرداز",
      "icom": { "inputs": [], "controls": [], "outputs": [], "mechanisms": [] }, "subprocess": null },
    { "key": "j1", "type": "junction", "junctionType": "XOR", "direction": "split" }
  ],
  "edges": [
    { "from": "n1", "to": "j1", "label": "" }
  ]
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `make test`
Expected: FAIL — `schemas/candidate.schema.json` missing.

- [ ] **Step 4: Write the schema**

`schemas/candidate.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "candidate.schema.json",
  "title": "Extract candidate graph — NEW process, temp keys (ARD §5.4)",
  "type": "object",
  "additionalProperties": false,
  "required": ["department", "process_name", "summary", "idef0", "kpis", "nodes", "edges"],
  "properties": {
    "department": { "type": "string", "pattern": "^[a-z]+$" },
    "process_name": { "type": "string" },
    "summary": { "type": "string" },
    "idef0": { "$ref": "#/$defs/icom" },
    "kpis": { "type": "array", "items": { "$ref": "#/$defs/kpi" } },
    "nodes": {
      "type": "array",
      "items": {
        "oneOf": [
          {
            "type": "object", "additionalProperties": false,
            "required": ["key", "type", "label", "description", "actor", "icom", "subprocess"],
            "properties": {
              "key": { "type": "string" },
              "type": { "const": "activity" },
              "label": { "type": "string" },
              "description": { "type": "string" },
              "actor": { "type": "string" },
              "icom": { "$ref": "#/$defs/icom" },
              "subprocess": { "type": ["string", "null"] }
            }
          },
          {
            "type": "object", "additionalProperties": false,
            "required": ["key", "type", "junctionType", "direction"],
            "properties": {
              "key": { "type": "string" },
              "type": { "const": "junction" },
              "junctionType": { "enum": ["AND", "OR", "XOR"] },
              "direction": { "enum": ["split", "join"] }
            }
          }
        ]
      }
    },
    "edges": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["from", "to"],
        "properties": {
          "from": { "type": "string" },
          "to": { "type": "string" },
          "label": { "type": "string" }
        }
      }
    }
  },
  "$defs": {
    "icom": {
      "type": "object", "additionalProperties": false,
      "required": ["inputs", "controls", "outputs", "mechanisms"],
      "properties": {
        "inputs": { "type": "array", "items": { "type": "string" } },
        "controls": { "type": "array", "items": { "type": "string" } },
        "outputs": { "type": "array", "items": { "type": "string" } },
        "mechanisms": { "type": "array", "items": { "type": "string" } }
      }
    },
    "kpi": {
      "type": "object", "additionalProperties": false,
      "required": ["name"],
      "properties": {
        "name": { "type": "string" }, "definition": { "type": "string" },
        "target": { "type": "string" }, "unit": { "type": "string" }
      }
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `make test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add schemas/candidate.schema.json tests/fixtures/candidate.json tests/test_candidate_schema.py
git commit -m "feat(phase0): candidate-graph schema + fixture"
```

---

### Task 5: update-delta schema (extract output, existing process)

**Files:**
- Create: `schemas/delta.schema.json`
- Create: `tests/fixtures/delta.json`
- Create: `tests/test_delta_schema.py`

**Interfaces:**
- Produces: `delta.schema.json` — `extract`'s output for an UPDATE (ARD §6.2): `add_nodes`, `add_edges`, `enrich_nodes`, `flag_removed`. `merge` applies it deterministically (enrich fills only empty fields; a filled-value change becomes `pending`).

- [ ] **Step 1: Write the failing test**

`tests/test_delta_schema.py`:
```python
import copy

from conftest import load_fixture

SCHEMA = "delta.schema.json"


def test_delta_is_valid(validate):
    assert validate(SCHEMA, load_fixture("delta.json")) == []


def test_enrich_requires_id_and_set(validate):
    d = copy.deepcopy(load_fixture("delta.json"))
    d["enrich_nodes"].append({"set": {"actor": "x"}})  # missing id
    assert validate(SCHEMA, d) != []


def test_empty_delta_is_valid(validate):
    empty = {"add_nodes": [], "add_edges": [], "enrich_nodes": [], "flag_removed": []}
    assert validate(SCHEMA, empty) == []
```

- [ ] **Step 2: Create the fixture**

`tests/fixtures/delta.json`:
```json
{
  "add_nodes": [
    { "key": "n1", "type": "activity", "label": "کنترل کیفیت", "description": "", "actor": "انباردار",
      "icom": { "inputs": [], "controls": [], "outputs": [], "mechanisms": [] }, "subprocess": null }
  ],
  "add_edges": [
    { "from": "cooking-001-n030", "to": "n1", "label": "" }
  ],
  "enrich_nodes": [
    { "id": "cooking-001-n020", "set": { "description": "اقلام بالاتر از سقف نیاز به تأیید مدیر دارند.", "actor": "مدیر رستوران" } }
  ],
  "flag_removed": [
    { "id": "cooking-001-n050" }
  ]
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `make test`
Expected: FAIL — `schemas/delta.schema.json` missing.

- [ ] **Step 4: Write the schema**

`schemas/delta.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "delta.schema.json",
  "title": "Extract update delta (ARD §6.2)",
  "type": "object",
  "additionalProperties": false,
  "required": ["add_nodes", "add_edges", "enrich_nodes", "flag_removed"],
  "properties": {
    "add_nodes": {
      "type": "array",
      "items": {
        "oneOf": [
          {
            "type": "object", "additionalProperties": false,
            "required": ["key", "type", "label", "description", "actor", "icom", "subprocess"],
            "properties": {
              "key": { "type": "string" },
              "type": { "const": "activity" },
              "label": { "type": "string" }, "description": { "type": "string" },
              "actor": { "type": "string" },
              "icom": { "$ref": "#/$defs/icom" },
              "subprocess": { "type": ["string", "null"] }
            }
          },
          {
            "type": "object", "additionalProperties": false,
            "required": ["key", "type", "junctionType", "direction"],
            "properties": {
              "key": { "type": "string" },
              "type": { "const": "junction" },
              "junctionType": { "enum": ["AND", "OR", "XOR"] },
              "direction": { "enum": ["split", "join"] }
            }
          }
        ]
      }
    },
    "add_edges": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["from", "to"],
        "properties": {
          "from": { "type": "string" }, "to": { "type": "string" }, "label": { "type": "string" }
        }
      }
    },
    "enrich_nodes": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["id", "set"],
        "properties": {
          "id": { "type": "string" },
          "set": { "type": "object" }
        }
      }
    },
    "flag_removed": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["id"],
        "properties": { "id": { "type": "string" } }
      }
    }
  },
  "$defs": {
    "icom": {
      "type": "object", "additionalProperties": false,
      "required": ["inputs", "controls", "outputs", "mechanisms"],
      "properties": {
        "inputs": { "type": "array", "items": { "type": "string" } },
        "controls": { "type": "array", "items": { "type": "string" } },
        "outputs": { "type": "array", "items": { "type": "string" } },
        "mechanisms": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `make test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add schemas/delta.schema.json tests/fixtures/delta.json tests/test_delta_schema.py
git commit -m "feat(phase0): update-delta schema + fixture"
```

---

### Task 6: overview schema

**Files:**
- Create: `schemas/overview.schema.json`
- Create: `tests/fixtures/overview.cooking.json`
- Create: `tests/test_overview_schema.py`

**Interfaces:**
- Produces: `overview.schema.json` — the per-department overview (ARD §4.4) built by the Phase-3 `summarize` agent and shown/edited in the UI.

- [ ] **Step 1: Write the failing test**

`tests/test_overview_schema.py`:
```python
import copy

from conftest import load_fixture

SCHEMA = "overview.schema.json"


def test_overview_is_valid(validate):
    assert validate(SCHEMA, load_fixture("overview.cooking.json")) == []


def test_person_requires_role(validate):
    o = copy.deepcopy(load_fixture("overview.cooking.json"))
    del o["personnel"][0]["role"]
    assert validate(SCHEMA, o) != []
```

- [ ] **Step 2: Create the fixture**

`tests/fixtures/overview.cooking.json`:
```json
{
  "department": "cooking",
  "name": "دپارتمان پخت",
  "sub_units": [
    { "name": "آشپزخانهٔ گرم", "description": "تهیهٔ غذاهای اصلی و گرم منو" },
    { "name": "واحد کنترل کیفیت", "description": "بررسی سلامت و کیفیت مواد و غذای آماده" }
  ],
  "personnel": [
    { "role": "سرآشپز", "person": "رضا کاظمی", "duties": ["مدیریت آشپزخانه", "کنترل کیفیت نهایی غذا"] },
    { "role": "کمک‌آشپز", "person": null, "duties": ["آماده‌سازی مواد"] }
  ],
  "updated_at": "2026-07-06T10:00:00Z"
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `make test`
Expected: FAIL — schema missing.

- [ ] **Step 4: Write the schema**

`schemas/overview.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "overview.schema.json",
  "title": "Department overview (ARD §4.4)",
  "type": "object",
  "additionalProperties": false,
  "required": ["department", "name", "sub_units", "personnel", "updated_at"],
  "properties": {
    "department": { "type": "string", "pattern": "^[a-z]+$" },
    "name": { "type": "string" },
    "sub_units": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["name", "description"],
        "properties": { "name": { "type": "string" }, "description": { "type": "string" } }
      }
    },
    "personnel": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["role", "duties"],
        "properties": {
          "role": { "type": "string" },
          "person": { "type": ["string", "null"] },
          "duties": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "updated_at": { "type": "string", "format": "date-time" }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `make test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add schemas/overview.schema.json tests/fixtures/overview.cooking.json tests/test_overview_schema.py
git commit -m "feat(phase0): overview schema + fixture"
```

---

### Task 7: segments schema (classify output)

**Files:**
- Create: `schemas/segments.schema.json`
- Create: `tests/fixtures/segments.json`
- Create: `tests/test_segments_schema.py`

**Interfaces:**
- Produces: `segments.schema.json` — `classify`'s output (ARD §5.2): a list of `{department, process_name, transcript_excerpt, status, match}` where status ∈ new|update|unchanged. Shown at the human checkpoint.

- [ ] **Step 1: Write the failing test**

`tests/test_segments_schema.py`:
```python
import copy

from conftest import load_fixture

SCHEMA = "segments.schema.json"


def test_segments_valid(validate):
    assert validate(SCHEMA, load_fixture("segments.json")) == []


def test_status_enum_enforced(validate):
    s = copy.deepcopy(load_fixture("segments.json"))
    s["segments"][0]["status"] = "maybe"
    assert validate(SCHEMA, s) != []


def test_update_match_id_may_be_null_for_new(validate):
    s = copy.deepcopy(load_fixture("segments.json"))
    # a 'new' segment carries match.existing_id = null
    assert any(seg["status"] == "new" and seg["match"]["existing_id"] is None
               for seg in s["segments"])
```

- [ ] **Step 2: Create the fixture**

`tests/fixtures/segments.json`:
```json
{
  "voice": "cooking-2026-07-06",
  "segments": [
    {
      "department": "cooking",
      "process_name": "خرید و پرداخت هزینه",
      "transcript_excerpt": "… وقتی درخواست خرید می‌رسد …",
      "status": "new",
      "match": { "existing_id": null }
    },
    {
      "department": "cooking",
      "process_name": "پخت غذای روز",
      "transcript_excerpt": "… سفارش‌های روز جمع می‌شود …",
      "status": "update",
      "match": { "existing_id": "cooking-002" }
    },
    {
      "department": "cooking",
      "process_name": "کنترل موجودی مواد اولیه",
      "transcript_excerpt": "… چیز جدیدی گفته نشد …",
      "status": "unchanged",
      "match": { "existing_id": "cooking-003" }
    }
  ]
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `make test`
Expected: FAIL — schema missing.

- [ ] **Step 4: Write the schema**

`schemas/segments.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "segments.schema.json",
  "title": "Classify output — process segments (ARD §5.2)",
  "type": "object",
  "additionalProperties": false,
  "required": ["voice", "segments"],
  "properties": {
    "voice": { "type": "string" },
    "segments": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["department", "process_name", "transcript_excerpt", "status", "match"],
        "properties": {
          "department": { "type": "string", "pattern": "^[a-z]+$" },
          "process_name": { "type": "string" },
          "transcript_excerpt": { "type": "string" },
          "status": { "enum": ["new", "update", "unchanged"] },
          "match": {
            "type": "object", "additionalProperties": false,
            "required": ["existing_id"],
            "properties": { "existing_id": { "type": ["string", "null"] } }
          }
        }
      }
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `make test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add schemas/segments.schema.json tests/fixtures/segments.json tests/test_segments_schema.py
git commit -m "feat(phase0): segments schema + fixture"
```

---

### Task 8: run meta & conflicts schemas

**Files:**
- Create: `schemas/run-meta.schema.json`
- Create: `schemas/conflicts.schema.json`
- Create: `tests/fixtures/run-meta.json`
- Create: `tests/fixtures/conflicts.json`
- Create: `tests/test_run_artifacts_schema.py`

**Interfaces:**
- Produces: `run-meta.schema.json` and `conflicts.schema.json` — the per-run artifacts under `runs/{voice}/` (ARD §2.2). `conflicts.json` reuses the same row shape as `process.pending`.

- [ ] **Step 1: Write the failing test**

`tests/test_run_artifacts_schema.py`:
```python
import copy

from conftest import load_fixture


def test_run_meta_valid(validate):
    assert validate("run-meta.schema.json", load_fixture("run-meta.json")) == []


def test_conflicts_valid(validate):
    assert validate("conflicts.schema.json", load_fixture("conflicts.json")) == []


def test_run_meta_requires_voice(validate):
    m = copy.deepcopy(load_fixture("run-meta.json"))
    del m["voice"]
    assert validate("run-meta.schema.json", m) != []
```

- [ ] **Step 2: Create the fixtures**

`tests/fixtures/run-meta.json`:
```json
{
  "voice": "cooking-2026-07-06",
  "departments": ["cooking"],
  "started_at": "2026-07-06T10:00:00Z",
  "finished_at": "2026-07-06T10:12:00Z",
  "attempt": 1,
  "processes": [
    { "id": "cooking-001", "status": "new" },
    { "id": "cooking-002", "status": "update" },
    { "id": "cooking-003", "status": "unchanged" }
  ]
}
```

`tests/fixtures/conflicts.json`:
```json
{
  "voice": "cooking-2026-07-06",
  "conflicts": [
    { "process": "cooking-001", "node": "cooking-001-n020", "field": "actor",
      "current": "مدیر رستوران", "proposed": "معاون مدیر",
      "source": "runs/cooking-2026-07-06", "status": "open" }
  ]
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `make test`
Expected: FAIL — both schemas missing.

- [ ] **Step 4: Write the schemas**

`schemas/run-meta.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "run-meta.schema.json",
  "title": "Per-run metadata (ARD §2.2 runs/{voice}/meta.json)",
  "type": "object",
  "additionalProperties": false,
  "required": ["voice", "departments", "started_at", "attempt", "processes"],
  "properties": {
    "voice": { "type": "string" },
    "departments": { "type": "array", "items": { "type": "string", "pattern": "^[a-z]+$" } },
    "started_at": { "type": "string", "format": "date-time" },
    "finished_at": { "type": ["string", "null"], "format": "date-time" },
    "attempt": { "type": "integer", "minimum": 1 },
    "processes": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["id", "status"],
        "properties": {
          "id": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" },
          "status": { "enum": ["new", "update", "unchanged"] }
        }
      }
    }
  }
}
```

`schemas/conflicts.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "conflicts.schema.json",
  "title": "Per-run conflicts (ARD §2.2 runs/{voice}/conflicts.json)",
  "type": "object",
  "additionalProperties": false,
  "required": ["voice", "conflicts"],
  "properties": {
    "voice": { "type": "string" },
    "conflicts": {
      "type": "array",
      "items": {
        "type": "object", "additionalProperties": false,
        "required": ["process", "node", "field", "current", "proposed", "source", "status"],
        "properties": {
          "process": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" },
          "node": { "type": "string" },
          "field": { "type": "string" },
          "current": {},
          "proposed": {},
          "source": { "type": "string" },
          "status": { "enum": ["open", "accepted", "rejected"] }
        }
      }
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `make test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add schemas/run-meta.schema.json schemas/conflicts.schema.json tests/fixtures/run-meta.json tests/fixtures/conflicts.json tests/test_run_artifacts_schema.py
git commit -m "feat(phase0): run-meta + conflicts schemas + fixtures"
```

---

### Task 9: Contract freeze — aggregate check, docs, PLAN reconciliation

**Files:**
- Create: `schemas/README.md`
- Create: `tests/test_all_schemas_selfvalid.py`
- Modify: `PLAN.md` (Phase 0 note: schemas live in code-repo; skeleton already done)
- Modify: `CLAUDE.md` (add a pointer to `schemas/`)

**Interfaces:**
- Consumes: every schema from Tasks 2–8.
- Produces: a meta-test proving all 8 schemas are themselves valid draft-2020-12 documents, and a README documenting the contract.

- [ ] **Step 1: Write the meta-test**

`tests/test_all_schemas_selfvalid.py`:
```python
from jsonschema import Draft202012Validator

from conftest import SCHEMA_DIR, load_json

EXPECTED = {
    "registry.schema.json", "process.schema.json", "candidate.schema.json",
    "delta.schema.json", "overview.schema.json", "segments.schema.json",
    "run-meta.schema.json", "conflicts.schema.json",
}


def test_all_expected_schemas_present():
    found = {p.name for p in SCHEMA_DIR.glob("*.schema.json")}
    assert EXPECTED <= found, f"missing: {EXPECTED - found}"


def test_every_schema_is_self_valid():
    for p in SCHEMA_DIR.glob("*.schema.json"):
        Draft202012Validator.check_schema(load_json(p))
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `make test`
Expected: PASS (all 8 present and self-valid). If `test_all_expected_schemas_present` fails, a prior task's schema is missing — fix before proceeding.

- [ ] **Step 3: Write the schemas README**

`schemas/README.md`:
```markdown
# schemas/ — the frozen JSON data contract (Phase 0)

Machine-checkable JSON Schemas (draft 2020-12) for every data shape the system
exchanges. Enforced by code (the `merge` CLI and the UI backend validate against
these); kept in `code-repo` so runtime (INV-2) cannot weaken validation.

| Schema | Shape | Produced by | Consumed by |
|---|---|---|---|
| `registry.schema.json` | department list (ARD §4.5) | maintained by hand | allocate-id, upload-bot |
| `process.schema.json` | a process (ARD §4.3) | merge | UI backend, UI |
| `candidate.schema.json` | new-process extract graph (ARD §5.4) | extract agent | merge |
| `delta.schema.json` | update delta (ARD §6.2) | extract agent | merge |
| `overview.schema.json` | department overview (ARD §4.4) | summarize agent | UI |
| `segments.schema.json` | classify output (ARD §5.2) | classify agent | checkpoint |
| `run-meta.schema.json` | per-run metadata (ARD §2.2) | process-voice | audit |
| `conflicts.schema.json` | per-run conflicts (ARD §2.2) | merge | Telegram report, UI inbox |

Golden fixtures conforming to each live in `../tests/fixtures/`. Run `make test`
to validate every fixture against its schema.

**Convention:** stored data uses ISO-8601 UTC timestamps and Latin digits.
Persian numerals and Jalali dates are UI-only presentation (Phase 6).
```

- [ ] **Step 4: Reconcile PLAN.md**

In `PLAN.md` §2 (Phase 0), update workstream 1 and the Deliverables line to state schemas + fixtures live in `code-repo/schemas/` and `code-repo/tests/fixtures/` (enforced by code, protected by INV-2), and note the data-repo skeleton + `registry.json` are already done (commit `84079d7`). Exact edit:

- Change "Turn the ARD §4/§6 shapes into validatable schemas (JSON Schema) committed to `data-repo`:" → "… committed to `code-repo/schemas/` (enforced by code; INV-2 keeps them out of runtime's reach):"
- Change the Deliverables line "schemas + fixtures committed to `data-repo`; `data-repo` directory skeleton;" → "schemas in `code-repo/schemas/` + fixtures in `code-repo/tests/fixtures/`; (data-repo skeleton + `registry.json` already done, commit `84079d7`);"

- [ ] **Step 5: Add a pointer in CLAUDE.md**

In `code-repo/CLAUDE.md`, under "## Layout (ARD §2.1)", add a row to the table:
```
| `schemas/` | Frozen JSON data contract (draft 2020-12); validated by `make test` |
```

- [ ] **Step 6: Run the full suite once more**

Run: `make test && make lint`
Expected: `make test` all green; `make lint` clean (or only trivial fixups — apply them).

- [ ] **Step 7: Commit**

```bash
git add schemas/README.md tests/test_all_schemas_selfvalid.py PLAN.md CLAUDE.md
git commit -m "feat(phase0): freeze contract — meta-check, docs, PLAN reconciliation"
```

---

## Self-Review

**Spec coverage (against PLAN.md §2 Phase 0):**
- Workstream 1 "JSON contract as schemas" → Tasks 2–8 (all eight shapes: registry, process, overview, segments, candidate, delta, run-meta, conflicts). ✅
- Workstream 2 "data-repo skeleton" → already done by the user (commit `84079d7`); Task 9 records it. ✅
- Workstream 3 "fixtures" → every schema task ships a golden fixture; process fixture seeded from the design prototype's `cooking-001`. ✅
- Workstream 4 "tooling" → Task 1 (venv, pytest, ruff, Makefile). vitest is deferred to Phase 6 (UI untouched in Phase 0) — noted here so it isn't silently dropped. ✅
- Workstream 5 "config surface" → the `config/*.env.example` files already enumerate each component's variables (verified: engine/ui-backend/upload-bot); no Phase-0 change needed. ✅
- Exit criterion "every schema validates its fixture and rejects a broken copy" → each task has a positive + at least one negative test. ✅
- Exit criterion "registry lists nine departments; adding a tenth is one record" → registry schema + fixture (Task 2). ✅
- Exit criterion "build+test in a single command" → `make test` (Task 1). ✅

**Placeholder scan:** no TBD/TODO; every schema and fixture is complete inline; every test shows real assertions. ✅

**Type consistency:** `validate(schema_name, instance)` and `load_fixture(name)` are defined in Task 1 and used unchanged in Tasks 2–9. `$defs` names (`icom`, `kpi`, `position`, `nodeSource`, `activityNode`, `terminalNode`, `junctionNode`, `edge`, `pending`) are internal to `process.schema.json`; the candidate/delta schemas redeclare their own `icom` def locally (no cross-file `$ref`, so no resolver setup needed). ✅

**Note on `format: date-time`:** `jsonschema` treats `format` as an annotation unless a format checker is enabled, so the negative tests never depend on date-format rejection — they target structural rules (enums, required, additionalProperties, patterns), which are always enforced. ✅
