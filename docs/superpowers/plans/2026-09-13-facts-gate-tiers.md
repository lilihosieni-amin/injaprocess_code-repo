# Facts engine gate tiers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every engine gate rule refuses, repairs or notes according to the approved tier table, a refusal costs one decision, and no input or decision is ever lost silently.

**Architecture:** A shared `Finding` type (`engine/merge_facts/tiers.py`) and one repair pass (`engine/merge_facts/normalise.py`) are laid down first. Then four tracks run **in parallel, each owning a disjoint set of files in its own git worktree**: the unit gate (`facts_plan/assemble.py`), the content pass (`merge_facts/content.py`), the store gate (`preconditions.py`, `apply.py`, `verbs.py`, schemas), and the planner plus panel (`facts_plan/build.py`, `ui/`). During the parallel phase every consumer calls `tiers.coerce()`, which accepts both legacy message strings and findings, so no track waits on another. The tracks merge, then the playbook, agent text and docs follow, then a real local preparation run.

**Tech Stack:** Python 3.11 engine (editable install, pytest), JSON Schema draft 2020-12, FastAPI ui-backend, React + TypeScript + Vite panel (vitest, tsc), Claude Code playbooks in the data repo.

**Spec:** `docs/superpowers/specs/2026-09-13-facts-gate-tiers-design.md` — **approved in full by the owner on 2026-09-13, every default in its section 9 included.** Every task implements spec rows by their ids (F1–F6, P1–P5, A1–A42, B1–B44, C1–C37) and must match the row's "Under the new tier" cell and the section 9 default where one exists.

## Global Constraints

- **Tiers (spec §4):** REFUSE only under R1–R4; REPAIR never changes meaning; NOTE stores the entry and marks it (`field_status[path] = "inferred"` or an `issues[]` entry of kind `shape`). A NOTE never triggers a retry, never counts as a failure, and never appears in the owner's Telegram report.
- **A REFUSE costs one decision** (unit gate) or **one entry** (store gate) — never a unit, a delta or a file.
- **One tier per rule at every gate** it runs at (unit gate, assemble, review, `apply`, `edit`, `validate facts-delta --store`). Tests prove it per row.
- **Unchanged rulings:** a stale review is redone, never skipped (v3.8); ids come only from `allocate-id` (INV-1); no fabricated provenance (INV-3); the owner's report carries no ids, paths, codes or English.
- **Determinism:** same inputs → byte-identical outputs; repairs run in a fixed, declared order.
- **Persian for anything a person reads in the panel or the report.** English only in logs, stderr and validator lines.
- **Git:** each track commits only its own files, by path (`git commit -- <paths>`), on its own branch; never `git add -A`; never push; never touch `main` of either repo; never touch the server.
- **Tests run scoped while iterating, then the track's full suite once before its final commit.** In a worktree the engine under test must be the worktree's: `PYTHONPATH=$WT/engine:$WT/ui-backend "$MAIN/.venv/bin/pytest" …` where `$MAIN` is the main code-repo checkout.
- **Parallel cap: 4 agents.** Implementers on Opus, task reviewers on Sonnet, final review on Opus.

---

## File ownership

| Track | Worktree branch | Owns (may modify) | Must not touch |
|---|---|---|---|
| Foundation | `gate-tiers` (main checkout) | `engine/merge_facts/tiers.py` (new), `engine/merge_facts/normalise.py` (new), `engine/validate/cli.py`, the `issue.kind` enum in `schemas/facts.schema.json` and `schemas/facts-delta.schema.json`, `engine/tests/test_tiers.py` (new) | everything else |
| **U** unit gate | `gate-tiers-unit` | `engine/facts_plan/assemble.py`, `engine/facts_plan/cli.py`, `schemas/facts-unit.schema.json`, `engine/tests/test_facts_plan_assemble.py`, `engine/tests/test_facts_plan_report.py`, `engine/tests/test_validate_facts_unit.py`, new `engine/tests/test_unit_gate_tiers.py`, new fixtures under `engine/tests/fixtures/prep-run-2026-09-12/` | content.py, preconditions.py, apply.py, verbs.py, build.py, store schemas, ui/ |
| **K** content pass | `gate-tiers-content` | `engine/merge_facts/content.py` (incl. its `CONTENT_REPAIRS`), `engine/facts_plan/cards/style.md`, `engine/merge_facts/audit.py`, `engine/tests/test_validate_facts_content.py`, `engine/tests/test_merge_facts_audit.py`, new `engine/tests/test_content_tiers.py` | assemble.py, preconditions.py, apply.py, verbs.py, build.py, schemas, ui/ |
| **S** store gate | `gate-tiers-store` | `engine/merge_facts/preconditions.py` (incl. its `STORE_REPAIRS`), `engine/merge_facts/apply.py`, `engine/merge_facts/verbs.py`, `engine/merge_facts/__init__.py`, `engine/merge_facts/ladder.py`, `schemas/facts.schema.json`, `schemas/facts-delta.schema.json` (except the Foundation's `shape` enum value), their tests (`test_merge_facts_apply.py`, `test_merge_facts_verbs.py`, `test_merge_facts_ladder.py`, `tests/test_facts_schema.py`, new `engine/tests/test_store_tiers.py`) | assemble.py, content.py, build.py, facts-unit schema, ui/ |
| **P** planner + panel | `gate-tiers-planner-ui` | `engine/facts_plan/build.py`, `engine/tests/test_facts_plan_build.py` (or the build test file that exists), `ui/src/facts/cards/*.tsx`, `ui/src/lib/factsLabels.ts`, `ui/src/api/types.ts`, their `*.test.ts(x)` | all other engine files, schemas |
| **E** playbook + docs | `gate-tiers` + data-repo branch `gate-tiers` | data-repo `.claude/skills/quantify/SKILL.md`, `.claude/agents/quantify.md`, `.claude/hooks/test_playbook_lint.py`; code-repo `docs/runbooks/07-facts.md`, `docs/guides/quantitative-facts-walkthrough.md`, `docs/decisions/0017-facts-pipeline-v3.md` | engine, schemas, ui |

---

### Task 0: Foundation — the shared Finding type, the repair pass, and a tier-aware validator CLI

**Files:**
- Create: `engine/merge_facts/tiers.py`, `engine/merge_facts/normalise.py`, `engine/tests/test_tiers.py`
- Modify: `engine/merge_facts/content.py` (add only `CONTENT_REPAIRS = []` near the top), `engine/merge_facts/preconditions.py` (add only `STORE_REPAIRS = []` near the top), `engine/validate/cli.py`, `schemas/facts.schema.json` and `schemas/facts-delta.schema.json` (add `"shape"` to the `issue.kind` enum only)

**Interfaces — Produces (every track relies on exactly these names):**
```python
# engine/merge_facts/tiers.py
REFUSE: str = "refuse"
NOTE: str = "note"
SHAPE_ISSUE_FA: str   # the default Persian description of a shape note

@dataclass(frozen=True)
class Finding:
    tier: str                 # REFUSE or NOTE
    label: str                # the gate's own label: "decisions[4] S-rec-…", "new[2] key", "T-3", "F-00012", "" for the document
    message: str              # English, one line, specifics included
    path: str | None = None   # QF-7 path inside the entry ("data/fields/qty/unit"); None = the whole entry
    mark: str = "issue"       # NOTE only: "inferred" → field_status[path]; "issue" → issues[] kind "shape"
    fa: str | None = None     # NOTE only: Persian description for the panel; None → SHAPE_ISSUE_FA
    def line(self) -> str: ...

def refuse(label: str, message: str, path: str | None = None) -> Finding
def note(label: str, message: str, path: str | None = None, mark: str = "issue", fa: str | None = None) -> Finding
def coerce(items) -> list[Finding]          # Finding passes through; "label: message" string → REFUSE
def refusals(findings) -> list[Finding]
def notes(findings) -> list[Finding]
def lines(findings) -> list[str]            # today's "label: message" format, for stderr and CLIs
def item_of(finding: Finding) -> tuple[str, int] | None   # ("decisions", 4) / ("new", 2) parsed from label; None = document level
def apply_notes(entry: dict, findings) -> None   # in place, idempotent; REFUSE findings ignored

# engine/merge_facts/normalise.py
def normalise_entry(entry: dict, ctx: dict) -> list[Finding]
# runs STORE_REPAIRS (preconditions.py) then CONTENT_REPAIRS (content.py), in list order.
# A repair is `def fn(entry: dict, ctx: dict) -> list[Finding] | None`, mutates `entry` in place.
# ctx keys: "root" (pathlib.Path), "store" (dict | None), "unit_rows" (list), "conventions" (dict), "label" (str)
```

- [ ] **Step 1: Write the failing tests** — `engine/tests/test_tiers.py`:

```python
from merge_facts import tiers
from merge_facts.normalise import normalise_entry


def test_a_legacy_message_string_becomes_a_refusal_with_its_label():
    [f] = tiers.coerce(["decisions[4] S-rec-9f60: field x carries a unit"])
    assert (f.tier, f.label, f.message) == (tiers.REFUSE, "decisions[4] S-rec-9f60",
                                            "field x carries a unit")
    assert tiers.item_of(f) == ("decisions", 4)


def test_findings_pass_through_and_split_by_tier():
    r = tiers.refuse("new[2] tol", "no key")
    n = tiers.note("T-3", "odd unit", path="data/unit", mark="inferred")
    found = tiers.coerce([r, n, "plain message with no label"])
    assert tiers.refusals(found)[0] is r and tiers.notes(found) == [n]
    assert tiers.item_of(r) == ("new", 2) and tiers.item_of(n) is None
    assert tiers.lines([r]) == ["new[2] tol: no key"]


def test_apply_notes_marks_inferred_and_appends_one_shape_issue_idempotently():
    entry = {"data": {"unit": "lb"}}
    found = [tiers.note("T-1", "unit lb undeclared", path="data/unit", mark="inferred"),
             tiers.note("T-1", "odd shape", fa="شکل غیرمعمول"),
             tiers.refuse("T-1", "ignored here")]
    tiers.apply_notes(entry, found)
    tiers.apply_notes(entry, found)
    assert entry["field_status"] == {"data/unit": "inferred"}
    assert entry["issues"] == [{"kind": "shape", "description": "شکل غیرمعمول", "affects": []}]


def test_a_note_without_persian_uses_the_default_description():
    entry = {}
    tiers.apply_notes(entry, [tiers.note("", "x")])
    assert entry["issues"][0]["description"] == tiers.SHAPE_ISSUE_FA


def test_normalise_entry_runs_the_registered_repairs_in_order(monkeypatch):
    from merge_facts import content, preconditions
    calls = []
    monkeypatch.setattr(preconditions, "STORE_REPAIRS", [lambda e, c: calls.append("store")])
    monkeypatch.setattr(content, "CONTENT_REPAIRS",
                        [lambda e, c: calls.append("content") or [tiers.note("", "n")]])
    out = normalise_entry({}, {"label": ""})
    assert calls == ["store", "content"] and [f.message for f in out] == ["n"]
```

- [ ] **Step 2: Run to verify failure** — `.venv/bin/pytest -q engine/tests/test_tiers.py` → FAIL (`ModuleNotFoundError: merge_facts.tiers`).

- [ ] **Step 3: Implement `engine/merge_facts/tiers.py`:**

```python
"""The three tiers every gate rule belongs to (spec 2026-09-13-facts-gate-tiers §4).

A rule reports a `Finding`. A REPAIR changes the entry in place and reports
nothing, or a NOTE when it could only partly succeed. While the rules are
converted track by track, `coerce` turns a legacy "label: message" string into
a REFUSE finding, so every consumer written against findings accepts both.
"""
import re
from dataclasses import dataclass

REFUSE = "refuse"
NOTE = "note"

#: What a person reads in the panel's issues card when a note carries no
#: Persian wording of its own.
SHAPE_ISSUE_FA = ("این مورد به شکلی ثبت شد که سامانه انتظار نداشت؛ "
                  "پیش از تأیید، این بخش را بازبینی کنید.")

_ITEM = re.compile(r"\b(decisions|new)\[(\d+)\]")


@dataclass(frozen=True)
class Finding:
    tier: str
    label: str
    message: str
    path: str | None = None
    mark: str = "issue"
    fa: str | None = None

    def line(self):
        return f"{self.label}: {self.message}" if self.label else self.message


def refuse(label, message, path=None):
    return Finding(REFUSE, label, message, path)


def note(label, message, path=None, mark="issue", fa=None):
    return Finding(NOTE, label, message, path, mark, fa)


def coerce(items):
    out = []
    for item in items or []:
        if isinstance(item, Finding):
            out.append(item)
            continue
        text = str(item)
        label, sep, message = text.partition(": ")
        out.append(refuse(label, message) if sep else refuse("", text))
    return out


def refusals(findings):
    return [f for f in coerce(findings) if f.tier == REFUSE]


def notes(findings):
    return [f for f in coerce(findings) if f.tier == NOTE]


def lines(findings):
    return [f.line() for f in coerce(findings)]


def item_of(finding):
    m = _ITEM.search(finding.label or "")
    return (m.group(1), int(m.group(2))) if m else None


def apply_notes(entry, findings):
    for f in notes(findings):
        if f.mark == "inferred" and f.path:
            entry.setdefault("field_status", {})[f.path] = "inferred"
            continue
        issue = {"kind": "shape", "description": f.fa or SHAPE_ISSUE_FA, "affects": []}
        issues = entry.setdefault("issues", [])
        if issue not in issues:
            issues.append(issue)
```

- [ ] **Step 4: Implement `engine/merge_facts/normalise.py`, and add the two empty lists:**

```python
"""The REPAIR tier (spec §4): one pass every gate runs on an entry before it
judges it — the unit gate after materialising, the assembly, `apply`, `edit`
and `validate facts-delta --store`. A repair changes the entry in place without
changing its meaning and may report NOTEs. The order is fixed: the store's
repairs, then the content pass's, each in list order."""
from merge_facts import content, preconditions
from merge_facts.tiers import coerce


def normalise_entry(entry, ctx):
    out = []
    for fn in list(preconditions.STORE_REPAIRS) + list(content.CONTENT_REPAIRS):
        out += coerce(fn(entry, ctx) or [])
    return out
```

In `engine/merge_facts/content.py`, right after the imports, add:

```python
#: The content pass's REPAIR tier, run by `merge_facts.normalise.normalise_entry`
#: in this order. `def fn(entry, ctx) -> list[Finding] | None`, mutating `entry`.
CONTENT_REPAIRS = []
```

In `engine/merge_facts/preconditions.py`, right after the imports, add:

```python
#: The store gate's REPAIR tier, run by `merge_facts.normalise.normalise_entry`
#: before `content.CONTENT_REPAIRS`. `def fn(entry, ctx) -> list[Finding] | None`.
STORE_REPAIRS = []
```

- [ ] **Step 5: Make `engine/validate/cli.py` tier-aware.** Every place it prints problems and chooses its exit code: print `tiers.lines(...)` of the refusals through `group_messages`, print notes under a `note:` prefix, and exit 2 **only when `tiers.refusals(...)` is non-empty**. With legacy string producers the behaviour is unchanged (every string is a refusal).

- [ ] **Step 6: Add `"shape"` to the `issue.kind` enum** in `schemas/facts.schema.json` and `schemas/facts-delta.schema.json`. If a test pins the enum against `build.ISSUE_TEXT`, exempt `shape` there with a one-line comment: it is raised by the gates, not by `build`.

- [ ] **Step 7: Run** `.venv/bin/pytest -q engine/tests/test_tiers.py`, then the whole `engine/tests` and `make test` → all pass.

- [ ] **Step 8: Commit** on branch `gate-tiers` (created from `main`):
```bash
git commit -m "feat(facts): the shared tier vocabulary — Finding, coerce, apply_notes and one repair pass" -- engine/merge_facts/tiers.py engine/merge_facts/normalise.py engine/tests/test_tiers.py engine/merge_facts/content.py engine/merge_facts/preconditions.py engine/validate/cli.py schemas/facts.schema.json schemas/facts-delta.schema.json
```

---

### Task U: The unit gate

**Worktree:** `code-repo/.claude/worktrees/gate-tiers-unit`, branch `gate-tiers-unit` from `gate-tiers`.

**Implements:** spec rows **A1–A42** (with the section 9 defaults for A1, A9, A16, A17, A22, A23, A26, A34, A36), fixes **F1, F2, F3, F5, F6**, and the unit-gate half of **P5**.

**Interfaces:**
- Consumes: Task 0's `tiers` and `normalise_entry`; `content.check_document` / `lint_prose` and `preconditions.undeclared_unit_problems` / `process_source_problems` **only through `tiers.coerce()`** — they return strings today and findings after tracks K and S.
- Produces:
  - `validate_unit(root, run_dir, path) -> list[Finding]` (was `list[str]`); REFUSE findings carry `decisions[N]`/`new[N]` labels so `tiers.item_of` resolves them.
  - `_outputs` folds a document **excluding only refused items**; each excluded candidate goes to `undecided[]` with `reason: "refused"` and its `lines`; a unit is `failed` only when its latest output is unreadable.
  - **Attempts merge.** A retry (`out.2.json`) answers only the decisions attempt 1 had refused. `_outputs` takes attempt 1's accepted decisions and overlays attempt 2's by candidate id (and `new[]` by `(kind, key)`); `validate_unit` on a retry judges only what it contains, so a candidate already decided by attempt 1 is not "undecided" (A17).
  - `unit_states` (`facts_plan/cli.py`): a unit is `done` when its latest attempt has **no REFUSE findings**; `retry` lists the refused item labels for the playbook (Task E).
  - `assembly.json` gains `lost_sources: [{"kind": "workbook" | "attachment" | "recording", "label": <owner's name>, "tables": int, "formulas": int}]`, consumed by `report` (F5).

**Steps:**

- [ ] **Step 1: Regression fixtures from the real run.** Copy, read-only from the local data repo's history (commit `3c6ede1`), the preparation run's `skeleton.json`, `plan.json`, `units/u-wb-amadesazi/{input.md,out.1.json,out.2.json}`, the seven refused meeting units' `out.1.json`, the sheets manifest, `departments/registry.json`, `departments/preparation/processes/*.json` and the units record, into `engine/tests/fixtures/prep-run-2026-09-12/`, plus a `README.md` naming the source commit. A helper builds a temporary data root from it.

- [ ] **Step 2: Failing tests** in `engine/tests/test_unit_gate_tiers.py`, at minimum:
  - F1: `out.2.json` of `u-wb-amadesazi` yields **zero REFUSE findings** (today: 7 about an inferred number carrying a unit).
  - F2: `out.1.json` of `u-wb-amadesazi` — a column `group` `{key, title}` is accepted and reaches the assembled record's field unchanged.
  - F3: a document with one refused decision lands its other decisions; the refused candidate is in `undecided[]` with `reason: "refused"`; `unit_states` reports `done` with a retry list naming exactly that decision.
  - Each of the seven refused meeting units from the run lands with notes and no refusal after tracks K and S (mark these `xfail(strict=True)` with the reason "needs track K/S" until integration, then remove the marks in the integration task).
  - F5: a run with a failed workbook unit and an unplaced attachment produces `lost_sources` and a report whose first block reads «فایل اکسل «…» ثبت نشد: N جدول و M فرمول آن بررسی نشد.» and «N عکس فرم بررسی نشد.» — and contains no id, path, code or Latin word.
  - F6: a record whose sources are only `voice`/`process`/`chat` gets `field_status` `inferred` on every column's `title`, `type` and `unit`; a record with a `sheet` source gets none.
  - One test per A-row whose tier changes, at the unit gate and (where the row says "assemble") at step 8.

- [ ] **Step 3: Implement,** row by row, exactly as each A-row's last cell and its section 9 default say. Rows A28, A33, A37, A38 are consumption only: call `tiers.coerce()` on what the content pass and preconditions return. A36 follows section 9: key from the record's key columns, else a segment of the row's title when unique in the record, else REFUSE that decision — never positional.

- [ ] **Step 4: Run** `PYTHONPATH=$WT/engine:$WT/ui-backend "$MAIN/.venv/bin/pytest" -q engine/tests` (the whole engine suite) → all pass except the strict xfails.

- [ ] **Step 5: Commit by path** on `gate-tiers-unit`: `feat(facts): the unit gate holds back per decision and only refuses what would break the store`.

---

### Task K: The content pass

**Worktree:** `code-repo/.claude/worktrees/gate-tiers-content`, branch `gate-tiers-content` from `gate-tiers`.

**Implements:** spec rows **B1–B44** with the section 9 defaults for B4/B6, B19, B22, B37, B38–B44 and B40; the content half of **P5**.

**Interfaces:**
- Consumes: Task 0's `tiers`.
- Produces:
  - `check_document(...) -> list[Finding]` (was `list[str]`). Labels stay exactly as today so the unit gate's renaming still finds them.
  - `lint_prose(...) -> list[Finding]`, every rule NOTE (B38–B44).
  - `CONTENT_REPAIRS` filled with the B-rows marked REPAIR, in the order B11, B18, B20, B25, B27, B28, B32, B33, B35, B36, B37, and the safe key repair of B4/B6 first of all.
  - `audit.py`: lint findings are listed as style findings and **no longer block `readiness`** (section 9 default for B38–B44).
  - `«بچ»` and `«پاس»` are removed from `PIPELINE_WORDS` and from `engine/facts_plan/cards/style.md`.

**Steps:**
- [ ] **Step 1: Failing tests** in `engine/tests/test_content_tiers.py`: one per B-row whose tier changes, asserting the tier, the path and mark of each NOTE, and for each REPAIR the exact repaired shape. Must include: B22 (a rule with inputs whose output has a `value` → no finding at all), B18 (a constant with a stray `lang` and no `expr` → repaired to `lang: "text"`), B40 («بچ» and «پاس» → no finding), B32/B33 (bad `field_status` markers repaired or dropped), B4 (a key `"Qty Total"` repaired to `qty_total`, and a key that stays invalid after repair → REFUSE).
- [ ] **Step 2: Implement** row by row as each B-row's last cell says. `group_messages` stays a string formatter; callers pass `tiers.lines(...)`.
- [ ] **Step 3: Run** the whole engine suite with the worktree's `PYTHONPATH` → pass. Existing tests that assert a now-relaxed refusal are rewritten to assert the new tier; say which in the commit message.
- [ ] **Step 4: Commit by path** on `gate-tiers-content`: `feat(facts): the content pass stores shape and style with a note and refuses only broken keys`.

---

### Task S: The store gate and store schemas

**Worktree:** `code-repo/.claude/worktrees/gate-tiers-store`, branch `gate-tiers-store` from `gate-tiers`.

**Implements:** spec rows **C1–C37** with the section 9 defaults for C9, C11, C12, C16, C19, C21, C22, C25, C26, C33, C35; prerequisites **P1, P2, P3**; the store half of **P5**.

**Interfaces:**
- Consumes: Task 0's `tiers` and `normalise_entry`; `content.check_document` **only through `tiers.coerce()`**.
- Produces:
  - Both store schemas: an envelope-level `extra: {"type": "object"}`; the C13 enums become open strings (a synonym map runs first as a REPAIR); the C10 scalars accept `null`.
  - `preconditions(root, store, entries, run_dir) -> list[Finding]`; `STORE_REPAIRS` filled with the C-rows marked REPAIR (C4, C5, C6, C7, C10, C15, C17, C18, C21, C22, C23, C32, and the C13/C28 synonym repairs), in that order.
  - `apply(...)` (P3): validates the delta schema **per entry**; runs `normalise_entry` and applies notes per entry; a refused entry is held back and listed (stderr and `touched.json` gains `held: [{"label", "lines"}]`), the rest is written; exit status 2 **only** when nothing at all could be written. `simulate` returns `(store_after, findings)`.
  - `edit(...)` (P2): schema-checks **only the entry it touched**, not the whole kind file.
  - `save_store` accepts everything the tiers store (P1); `extra` survives a round trip through the ladder.

**Steps:**
- [ ] **Step 1: Failing tests** in `engine/tests/test_store_tiers.py`, at minimum: a delta with one entry refused (C2: no `title`) and one valid → the valid one is written, the refused one listed, exit 0 (P3); `role: "ledger"` → stored with `field_status["data/role"] = "inferred"` (C13); an unknown member → kept under `extra["data/fields/qty/note"]` (C5); `unit: "lb"` undeclared → stored with a note, `unit_raw` kept (C28); a citation to a missing file with another valid source → only that citation dropped, with a note (C33 default); `edit` succeeds on an entry while another entry of the same kind in the store is off-contract (P2); `extra` survives `apply` then `edit`.
- [ ] **Step 2: Implement** row by row. Every NOTE-tier value must also pass `save_store` (P1) — assert it in each test.
- [ ] **Step 3: Run** the whole engine suite and `make test` (it runs the schema contract tests) with the worktree's `PYTHONPATH` → pass.
- [ ] **Step 4: Commit by path** on `gate-tiers-store`: `feat(facts): the store gate writes every entry it can and holds back only what would break the store`.

---

### Task P: The planner (photos) and the panel

**Worktree:** `code-repo/.claude/worktrees/gate-tiers-planner-ui`, branch `gate-tiers-planner-ui` from `gate-tiers`; `ui/node_modules` is a symlink to the main checkout's.

**Implements:** fix **F4** and prerequisite **P4** (a)–(d).

**Interfaces:**
- Produces:
  - `plan_units(...)` never appends attachments to a transcript unit. Attachments become `attachment` units (`u-att-1`, `u-att-2`, … in input order) packed to the size budget, one attachment per unit when a single one is over budget (it is dispatched with an `oversized` issue, as `_set_aside` already records).
  - The plan invariant extends to inputs: every chosen transcript range and every attachment appears in exactly one unit; otherwise `build` exits 2 naming the file.
  - Panel: `RuleCard` `OutputRow` renders `valueText(output)` when `value` or `range` is present (P4a); `label()` never throws, in development or production (P4b); `ItemCard` tolerates `pack: null`, `RecordCard` tolerates `signatures[].row_range: null`, `RuleCard` renders an object in `edge_cases[].input/expected` as JSON text (P4c); `ISSUE_KIND_LABELS.shape` in Persian and `issue.kind` accepts `"shape"` in `types.ts` (P4d); `types.ts` gains an optional `extra?: Record<string, unknown>` on the entry.

**Steps:**
- [ ] **Step 1: Failing engine test:** a department with one 553-line transcript and 13 attachment texts totalling ~51 KB (build the fixture synthetically at those sizes) → the plan has attachment units carrying all 13 attachments, the transcript chunks carry none, and every input appears exactly once. A second test: an input placed nowhere makes `build` exit 2 naming it.
- [ ] **Step 2: Failing panel tests** (vitest), one per P4 item: the threshold renders its number; `label()` with an unknown key returns the raw key without throwing under `import.meta.env.DEV`; each of the three crash cases renders without throwing; a `shape` issue shows its Persian label.
- [ ] **Step 3: Implement** both halves.
- [ ] **Step 4: Run** the engine suite with the worktree's `PYTHONPATH`; in `ui/`: `./node_modules/.bin/vitest run src/facts src/lib` and `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit` → pass.
- [ ] **Step 5: Commit by path** on `gate-tiers-planner-ui`: `fix(facts): photos get their own units and the panel draws every shape the store may hold`.

---

### Task I: Integration

**Branch:** `gate-tiers` (main checkout).

- [ ] **Step 1:** Merge `gate-tiers-content`, `gate-tiers-store`, `gate-tiers-unit`, `gate-tiers-planner-ui` into `gate-tiers` in that order (`--no-ff`). Files are disjoint; a textual conflict means a track broke ownership — stop and report it.
- [ ] **Step 2:** Remove every `tiers.coerce()` compatibility path that is now dead only where it is provably dead; keep `coerce` itself.
- [ ] **Step 3:** Remove the strict xfail marks from Task U's meeting-unit tests; they must pass now.
- [ ] **Step 4:** Run the whole engine suite, `make test`, the ui-backend suite, the full vitest suite, `tsc` and `npm run build` → all pass.
- [ ] **Step 5:** Commit: `merge: facts gate tiers — the four tracks together`.

### Task E: Playbook, agent text and docs

- [ ] **Step 1:** data-repo branch `gate-tiers`: `quantify/SKILL.md` — Stage U retry re-dispatches only the decisions `facts-plan status` lists as refused; attachment units are dispatched like any unit; Stage 5 `apply` exits 0 with held entries listed and the run continues; the report reflects `lost_sources`. `agents/quantify.md` — unit mode: a retry answers only the listed decisions; a column may carry `group` `{key, title}`; attachment mode. Pinned hook sentences stay verbatim; add pins for the new sentences. Hooks tests pass.
- [ ] **Step 2:** code-repo docs: runbook 07 (tiers, per-decision hold-back, per-entry apply, lost sources in the report), the walkthrough, and an ADR 0017 ruling paragraph dated 2026-09-13 quoting the owner's approval.
- [ ] **Step 3:** Commit each repo by path.

### Task F: Final review and local end-to-end run

- [ ] **Step 1:** Whole-branch review on Opus against the spec (every row id accounted for).
- [ ] **Step 2:** One fix round for its findings, then a scoped re-review.
- [ ] **Step 3: Local run of preparation.** In the local data repo, on a throwaway branch `local-test-gate-tiers` created from `main`: reset `facts/` to the seed (`git checkout 8177ae7 -- facts/` and remove `facts/originals`), commit on that branch only. Rebuild the local control-bot from `gate-tiers`, check out the data repo's `gate-tiers` playbook files onto the throwaway branch, run `/quantify` for preparation headless with the real Excel file and all 13 photos. **Success:** the Excel's tables and formulas land; every attachment is read by a unit; any refusal holds back only its decision; the report names anything lost.
- [ ] **Step 4:** Regression: the same for cooking; compare counts with the earlier cooking runs.
- [ ] **Step 5:** Report to the owner. Switch the local data repo back to `main` and delete the throwaway branch only with the owner's word. Nothing is pushed and the server is not touched.
