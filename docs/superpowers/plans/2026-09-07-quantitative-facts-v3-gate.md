# Quantitative Facts v3 — Closing the Unit Gate: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a unit's output impossible to refuse later for a per-entry reason, whatever evidence it came from, by validating the materialised entry against the store contract at the unit's own gate, showing the unit that contract, closing the paper-form `location`, reporting every error by field path, enforcing the attempt cap and the yield stop mechanically, and naming unread attachments — then prove it on the existing cooking run without the owner testing again.

**Architecture:** One shared `materialise` in `facts_plan.assemble` builds the entry a decision becomes; `validate facts-unit`, `status` and `assemble` all judge that entry with the same store schema and content pass `apply` uses, so Stage V keeps only cross-entry checks. A shape section generated from `facts.schema.json` rides in every unit input, so the card and the checker cannot drift. The intake stays a dispatch table; anything outside it becomes a named issue the owner sees. The runtime (guard, playbook, agent) states the caps as engine rules and closes the door to hand-driving the engine.

**Tech Stack:** Python 3.11/3.12 (stdlib + `jsonschema` via `engine_common.validate`), pytest; JSON Schema draft 2020-12; React + TypeScript with vitest (`ui/`); Claude Code runtime prompts in Markdown (`data-repo/.claude/`).

**Spec:** `docs/superpowers/specs/2026-09-07-quantitative-facts-v3-gate-design.md` (addendum v3.4 to `2026-09-06-quantitative-facts-v3-design.md`). The addendum's §2 invariants I1 and I2 are the acceptance criteria; the plan argues from it.

## Global Constraints

- All components communicate only through the filesystem under `DATA_ROOT`; engine CLIs are deterministic, check preconditions, and `exit 2` with nothing written on failure (ARD §7).
- IDs are minted only by `allocate-id` from `merge facts apply`; `validate`, `status`, `assemble`, `simulate` never mint and never write the store (INV-1).
- **I1:** anything `validate facts-unit` accepts, `assemble` + `simulate` cannot refuse for a per-entry reason; the unit gate runs the store schema per kind and `merge_facts.content.check_document(doc, "facts-delta", store, unit_symbols)` over the materialised entries.
- **I2:** `extract-attachment` reads exactly the extensions in `CONVERTERS`; every other attachment becomes a skeleton issue `unread_attachment` named in `gate-b.md` and `report.md`; a unit never sees an unread file.
- The shape section is generated from `facts.schema.json` at build time, never hand-written; a test asserts every enum value and required key of the five payloads appears in it.
- `recordData.location` is chosen by `medium`: `sheet` → `{path, spreadsheetId, sheet}`, `paper` → `{kept_at, holder}`, `external` → `{system, kept_at}`, `native` → `{kept_at}`; all closed; the paper strings are Persian prose and are linted.
- `engine_common.validate` reports one line per distinct rule with the field path and the count, never truncated to five, never a dumped entry; a cap of 80 lines with `… and N more`.
- A third `out.<n>.json` is refused by `validate facts-unit` and counted `failed` by `status` and `assemble`; on `yield true` the coordinator ends the turn.
- The guard blocks `python`/`python3`/`uv run python` invocations that import `facts_plan`, `merge_facts` or `engine_common`; the engine CLIs stay allowed.
- Owner-facing text (`gate-b.md`, `report.md`, the playbook's persian blocks, `ISSUE_TEXT`/`ISSUE_FA`, the shape card's Persian prose) carries no command, path, account id, unit id, stage letter or department code; `csv`, `Excel`, `sheet` stay untranslated. The shape card's key names and enum values are ASCII by necessity and are rendered as code spans.
- Persian in `title`, `statement` and every prose field; ASCII keys per `SEGMENT_RE`/`KEY_RE`; the two schema files stay in step (the `$defs` diff test).
- Tests are scoped: `.venv/bin/pytest -q -k "<expr>"`; from a worktree never pass explicit test file paths; ui tests via `npm --prefix ui run test -- <pattern>` (cwd must be `ui`); data-repo hook tests via the code venv's pytest on the hooks directory.
- Commits: one per task, named paths only, footer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
  ```
  Never push. Never run git on the data-repo from the host while the control-bot is running a session; after any host-side git operation on the data-repo, restart the control-bot before it runs git (Docker Desktop's bind-mount cache).
- The existing run directory `data-repo/runs/facts/cooking/20260907-052345` is the acceptance input and is never edited by hand; its unit outputs are re-validated, not rewritten.

---

## File structure

| file | responsibility |
|---|---|
| `engine/engine_common/__init__.py` | T1 — `validate` reports every error grouped by rule with field paths; `oneOf` on `entries[N]` re-validated against the kind's branch |
| `engine/validate/cli.py` | T1 — prints the grouped lines |
| `schemas/facts.schema.json`, `schemas/facts-delta.schema.json`, `schemas/README.md`, `tests/fixtures/facts/*`, `tests/test_facts_schema.py` | T2 — `location` by `medium`, `unread_attachment`, the v2.1 note |
| `engine/facts_plan/assemble.py` | T3 — `materialise`, the closed unit gate, the attempt cap; T4b — unread files in `gate_b`/`report`, `ISSUE_FA` |
| `engine/facts_plan/cli.py` | T3 — `unit_states` treats `n > 2` as failed |
| `engine/facts_plan/build.py` | T4a — `shape_card`; T4b — `unread_attachments`, `ISSUE_TEXT` |
| `engine/tests/fixtures/facts_plan/make_dump.py`, `engine/tests/fixtures/facts_plan/units/*` | T4c — the evidence-type fixture |
| `engine/tests/test_validate.py`, `test_validate_facts_unit.py`, `test_facts_plan_cards.py`, `test_facts_plan_units.py`, `test_facts_plan_report.py`, `test_facts_evidence_types.py` (new) | T1–T4 |
| `data-repo/.claude/hooks/guard.py`, `test_guard.py`, `test_playbook_lint.py`, `.claude/skills/quantify/SKILL.md`, `.claude/agents/quantify.md` | T5 |
| `ui/src/api/types.ts`, `ui/src/lib/factsLabels.ts`, `ui/src/facts/cards/RecordCard.tsx` and tests | T6 |
| `docs/superpowers/specs/2026-09-06-quantitative-facts-v3-design.md`, `docs/runbooks/07-facts.md`, `docs/decisions/0017-facts-pipeline-v3.md`, `docs/decisions/README.md` | T7 |
| (operational) | T8 — merge, rebuild, the headless acceptance run on the existing run directory |

---
## Assembler's rulings (binding over every task below)

The three drafters read the code and found where the addendum was imprecise; the addendum (v3.4) now
says what follows, and every task obeys it:

1. `recordData.location` by `medium`: `sheet` `{path, spreadsheetId, sheetId, sheet}` closed, nothing required; `paper` `{kept_at, holder}` both required; `external` `{system, kept_at}` both required plus optional `identifier_scheme`; `native` `{kept_at}` optional plus optional `identifier_scheme`. The seed `F-00001` (`native`, `location: {}`) and the Sepidz till (`external`, `identifier_scheme`) must keep validating.
2. `kept_at`, `holder`, `system` are prose leaves of the content pass (`PROSE_IN_DATA` / `_check_prose`), linted like `grain`.
3. `source.type` is unchanged; an attachment-derived entry cites `docx` / `pdf` / `photo` by the sidecar's suffix (`.txt` → `docx`, `.pdf.md` → `pdf`, `.image.md` → `photo`) with the sidecar path as `ref`; `_unit_sources` stops citing every `.md` input as `voice`; the quote-admission `if/then` admits those three types (Task 2 schema, Task 3 `_unit_sources`).
4. The shape section is rendered for all five kinds on every unit (v3.3 §2.5 restricts no unit's `new[]`); its ~2 300 tokens count in `fits`. If the frozen cooking fixture's unit ids change because a unit now splits, Task 4a regenerates `expected.json` with the fixture test's own recipe and renames the three unit-output fixtures to the new ids — it does not stop.
5. `facts-plan build <dept> --run R --refresh-inputs` (Task 4a) re-renders every `units/*/input.md` and `review/input.md` from the existing `skeleton.json`/`plan.json`, touching no output and not the plan; it prints a warning line per input over budget and never splits. Task 8 uses it on the existing run.
6. The review document is judged by the closed gate inside `assemble --review` over the folded draft, before anything is written, with the same field-path lines naming `review/out.json` — not per `facts-plan status` call (Task 3).
7. `gate_b` gains the «فایل‌هایی که در این اجرا خوانده نشدند» block beside `report`'s (a new line in the Gate B message; the owner is told in the closing message). `.xlsx` is never listed there; passthrough text is never "unread".
8. Engine messages are English (`… and N more`); the cap message is `<file>: attempt cap: two per run`.
9. `unread_attachment` joins `issue.kind` in both schemas (the vocabulary), and `build` is what enforces it; it is `run_only` and never reaches the store.
10. The guard's engine-import rule is a text match and is knowingly shallow; the playbook lint's verbatim Stage U sentences couple the two repositories on purpose.
11. Task order: 1 → 2 → 3 → 4a → 4b → 4c → 5 ∥ 6 ∥ 7 (5 in the data-repo worktree, 6 and 7 in the code-repo worktree, one implementer per repo at a time) → 8. Worktrees: code-repo `.claude/worktrees/facts-v3-gate` from main; data-repo `../data-repo.facts-v3-gate` from main. After Task 8's merges, restart the control-bot before it runs git.

---
### Task 1: `validate` reports every error by field path (§3.4)

`engine_common.validate` today folds the first five errors onto one line, and an
`entries[N]` `oneOf` failure prints the entry. That is postmortem cause H: the
coordinator chased five errors at a time and never saw a field name.

#### Files

| Path | Anchor | Change |
|---|---|---|
| `engine/engine_common/__init__.py` | `_VALIDATORS = {}` at 78, `validate` at 81–91 | rewrite `validate`'s error half; add `_path`, `_entry_branches`, `_branch_of`, `_expand`, `_error_lines`; keep the `_VALIDATORS` cache exactly as it is |
| `engine/tests/test_common.py` | end of file | the new tests |
| `engine/validate/cli.py` | 53–55 (`except ValueError` → `print(str(e), file=sys.stderr)`) | **no change** — see Interfaces |

#### Interfaces

Consumes:
- `jsonschema.Draft202012Validator(schema).iter_errors(instance) -> Iterator[ValidationError]`
  (`.path` as a `deque` of `str | int`, `.message`, `.validator`).
- `schemas/facts-delta.schema.json` `$defs.entry` = `{"allOf": [ {"$ref": envelope},
  {"oneOf": [ {"properties": {"kind": {"const": "<k>"}, "data": {"$ref": "#/$defs/<k>Data"}}}, … ]},
  {"properties": {"data": {"not": {"required": ["original_ref"]}}}} ]}`.
  `schemas/facts.schema.json` has the same shape with **two** `allOf` members, not three —
  so the `oneOf` is found by scanning `allOf`, never by index.

Produces (unchanged signature, changed message):

```python
def validate(schema_name, instance):
    """Raise ValueError with one line per distinct rule, or return None."""
```

Message shape:

```
facts-delta.schema.json validation failed:
entries[N].data.fields[N].type: 'text' is not one of ['string', 'number', 'integer', 'boolean', 'date'] (3 places: entries[0].data.fields[0].type, entries[1].data.fields[0].type, entries[2].data.fields[0].type)
entries[3].data: 'outputs' is a required property
```

- one occurrence → the concrete path, no `(n places: …)` suffix;
- more than one → the path with every integer index replaced by `N`, then
  `(<n> places: <first three concrete paths, comma-separated>)`;
- more than 80 lines → the first 80 plus `… and N more`.

New module-private helpers (names Tasks 4–7 may rely on):
`_path(parts) -> str`, `_entry_branches(schema) -> list[dict]`,
`_branch_of(schema, entry) -> dict | None`, `_expand(schema, instance, errors) -> list[tuple[str, str]]`,
`_error_lines(schema, instance, errors) -> list[str]`.

Callers, all grepped (`grep -rn "validate(" --include=*.py engine ui-backend tests`):
`order/__init__.py:74`, `dump_workbook/cli.py:42`, `merge_facts/__init__.py:282` (`save_store`),
`merge/__init__.py` ×11, `facts_plan/assemble.py:90`, `merge_facts/apply.py:84` (`apply`) and
`:218` (the store `apply`/`simulate` write), `layout/cli.py:19`, `validate/cli.py:51`.
**None parses the message** — the only reader of the text is
`grep -rn "validation failed"` → `engine_common/__init__.py:91` itself. All of them keep
raising/propagating `ValueError`; `save_store`, `apply` and `simulate` are covered by the
step-3 regression run.

`validate/cli.py` needs no diff: line 54 is already
`print(str(e), file=sys.stderr)`, and a multi-line message prints one line per line.
(Ladder rung 1: the requirement is already met by code that exists.)

#### Step 1 (RED) — the test

Append to `engine/tests/test_common.py`:

```python
def _rec(n, ftype):
    """A delta record whose one column carries a type the store has no such thing as."""
    return {"kind": "record", "key": f"r{n}", "title": "ت", "statement": "ش",
            "scope": {"departments": ["cooking"], "branches": []},
            "source": [{"type": "chat", "ref": None}], "retired": False,
            "data": {"medium": "sheet", "role": "log", "location": {},
                     "fields": [{"key": "x", "type": ftype}]}}


def _ruleless():
    """A rule with no `outputs` — the second commonest Stage V refusal of the
    2026-09-07 run, and a plain `required` failure rather than a oneOf one."""
    return {"kind": "rule", "key": "q", "title": "ت", "statement": "ش",
            "scope": {"departments": ["cooking"], "branches": []},
            "source": [{"type": "chat", "ref": None}], "retired": False,
            "data": {"inputs": []}}


def test_a_oneof_failure_is_reported_by_field_path_and_grouped():
    """§3.4 — three records failing one rule are one line naming the field and
    the three places; the fourth entry's own rule is a second line. No entry is
    dumped into the message, which is what made the first run unreadable."""
    doc = {"schema_version": 2,
           "entries": [_rec(1, "text"), _rec(2, "text"), _rec(3, "text"), _ruleless()]}
    with pytest.raises(ValueError) as excinfo:
        validate("facts-delta.schema.json", doc)
    lines = str(excinfo.value).splitlines()
    assert lines[0] == "facts-delta.schema.json validation failed:"
    assert lines[1:] == [
        "entries[N].data.fields[N].type: 'text' is not one of "
        "['string', 'number', 'integer', 'boolean', 'date'] (3 places: "
        "entries[0].data.fields[0].type, entries[1].data.fields[0].type, "
        "entries[2].data.fields[0].type)",
        "entries[3].data: 'outputs' is a required property"]
    assert "statement" not in str(excinfo.value)   # no entry body anywhere


def test_a_lone_error_keeps_its_concrete_path():
    doc = {"schema_version": 2, "entries": [_rec(1, "text")]}
    with pytest.raises(ValueError) as excinfo:
        validate("facts-delta.schema.json", doc)
    assert str(excinfo.value).splitlines()[1].startswith(
        "entries[0].data.fields[0].type: 'text' is not one of")
    assert "places:" not in str(excinfo.value)


def test_the_line_cap_holds_at_eighty():
    doc = {"schema_version": 2,
           "entries": [_rec(n, f"text{n}") for n in range(100)]}
    with pytest.raises(ValueError) as excinfo:
        validate("facts-delta.schema.json", doc)
    lines = str(excinfo.value).splitlines()[1:]
    assert len(lines) == 81 and lines[-1] == "… and 20 more"


def test_a_valid_document_still_raises_nothing():
    assert validate("facts-delta.schema.json",
                    {"schema_version": 2, "entries": [_rec(1, "string")]}) is None
```

`engine/tests/test_common.py` already imports `pytest` and `from engine_common import …`;
add `validate` to that import if it is not there.

Run: `.venv/bin/pytest -q -k "oneof_failure or concrete_path or line_cap_holds or still_raises_nothing"`
→ 3 failed (`AssertionError`), 1 passed (`test_a_valid_document_still_raises_nothing` —
`validate` already returns `None` on a clean document).

#### Step 2 (GREEN) — the implementation

In `engine/engine_common/__init__.py`, add `import re` beside the existing imports
(line 1–4 block) and replace lines 78–91 with:

```python
_VALIDATORS = {}
_SCHEMAS = {}

#: Every integer index of a rendered path, so two entries breaking one rule
#: group onto one line (§3.4).
_INDEX_RE = re.compile(r"\[[0-9]+\]")

#: §3.4's ceiling: a pathological document stays readable.
LINE_CAP = 80


def _path(parts):
    """A jsonschema error path as `entries[3].data.fields[2].type`."""
    out = ""
    for part in parts:
        out += f"[{part}]" if isinstance(part, int) else (f".{part}" if out else part)
    return out or "<document>"


def _entry_branches(schema):
    """The per-kind branches of `$defs.entry`'s `oneOf`, found by scanning the
    `allOf` — `facts.schema.json` has two members and `facts-delta.schema.json`
    three, so the index is not the same in both files."""
    for member in (schema.get("$defs", {}).get("entry", {}).get("allOf") or []):
        if "oneOf" in member:
            return member["oneOf"]
    return []


def _branch_of(schema, entry):
    """The branch whose `kind` matches this entry's, as a schema of its own.
    `$defs` travels with it so its `#/$defs/…` refs still resolve."""
    for branch in _entry_branches(schema):
        kind = branch.get("properties", {}).get("kind", {})
        if entry.get("kind") in ([kind["const"]] if "const" in kind
                                 else kind.get("enum") or []):
            return {**branch, "$defs": schema["$defs"],
                    "$schema": schema["$schema"]}
    return None


def _expand(schema, instance, errors):
    """`[(path, message)]` — an `entries[N]` that fails `oneOf` says only that
    the whole entry matched nothing, and its `message` is the entry dumped. It
    is re-validated against the branch of its own `kind` so the failure is
    reported where it is: `entries[3].data.fields[2].type`."""
    out = []
    for error in errors:
        entry = (instance["entries"][error.path[1]]
                 if error.validator == "oneOf" and len(error.path) == 2
                 and error.path[0] == "entries" else None)
        branch = _branch_of(schema, entry) if isinstance(entry, dict) else None
        found = list(Draft202012Validator(branch).iter_errors(entry)) if branch else []
        if found:
            out += [(_path(list(error.path) + list(f.path)), f.message) for f in found]
        elif entry is not None:
            out.append((_path(error.path),
                        f"kind {entry.get('kind')!r} matches no payload shape"))
        else:
            out.append((_path(error.path), error.message))
    return out


def _error_lines(schema, instance, errors):
    """One line per distinct `(path with its indices generalised, rule)`, with
    the count and the first three concrete paths (§3.4)."""
    groups = {}
    for path, message in _expand(schema, instance, errors):
        groups.setdefault((_INDEX_RE.sub("[N]", path), message), []).append(path)
    lines = [f"{paths[0]}: {message}" if len(paths) == 1 else
             f"{generic}: {message} ({len(paths)} places: {', '.join(paths[:3])})"
             for (generic, message), paths in groups.items()]
    return lines[:LINE_CAP] + [f"… and {len(lines) - LINE_CAP} more"] \
        if len(lines) > LINE_CAP else lines


def validate(schema_name, instance):
    v = _VALIDATORS.get(schema_name)
    if v is None:
        schema = read_json(schema_dir() / schema_name)
        Draft202012Validator.check_schema(schema)
        v = Draft202012Validator(schema)
        _VALIDATORS[schema_name], _SCHEMAS[schema_name] = v, schema
    # Sorted by the RENDERED path, not by `list(e.path)`: a path mixes `str`
    # and `int` members, and comparing `['entries', 0]` against
    # `['schema_version']` is a TypeError waiting for the first document that
    # breaks a top-level rule and an entry rule at once.
    errors = sorted(v.iter_errors(instance), key=lambda e: _path(e.path))
    if errors:
        lines = _error_lines(_SCHEMAS[schema_name], instance, errors)
        raise ValueError(f"{schema_name} validation failed:\n" + "\n".join(lines))
```

Nothing else in the file changes.

#### Step 3 (VERIFY)

```
.venv/bin/pytest -q -k "oneof_failure or concrete_path or line_cap_holds or still_raises_nothing"
```
→ `4 passed`.

Then the regression over every caller that raises `ValueError` from `validate`
(`save_store`, `apply`, `simulate`, `merge`, `order`, `layout`, the CLI):

```
.venv/bin/pytest -q engine/tests tests ui-backend/tests
```
→ the same pass count as the baseline, no failures. (If a test asserts on the
old one-line text, it is the assertion that is wrong: no production caller reads
the message.)

#### Step 4 (COMMIT)

```
git add engine/engine_common/__init__.py engine/tests/test_common.py
git commit -m "$(cat <<'EOF'
fix(validate): every error, by field path, grouped by rule

`engine_common.validate` folded the first five errors onto one line, and an
`entries[N]` that failed the `entry` oneOf printed the whole entry as its
message. The 2026-09-07 cooking run's coordinator therefore chased five
refusals at a time and never saw a field name.

An `entries[N]` oneOf failure is now re-validated against the branch of its
own `kind` and reported where it happens
(`entries[3].data.fields[2].type: 'text' is not one of [...]`). Identical
`(path with its indices generalised, rule)` pairs group onto one line with the
count and the first three concrete paths, and 80 lines is the ceiling.

Sorting by the rendered path also closes a latent TypeError: a jsonschema
path mixes str and int, so the old `key=list(e.path)` would have died on a
document breaking a top-level rule and an entry rule at once.

`validate/cli.py` needs no change — it already prints `str(e)`, which is now
one line per rule. No caller parses the message.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```

---

### Task 2: `location` closes, `unread_attachment` exists (§3.3, §3.7 schema half)

#### Files

| Path | Anchor | Change |
|---|---|---|
| `schemas/facts.schema.json` | `issue.kind` enum 74–79; `recordData` 224–229 (`"location": { "type": "object" }` at 229) | add `unread_attachment`; `location` per `medium` |
| `schemas/facts-delta.schema.json` | `issue.kind` enum 72–77; `recordData` 221–226 (`location` at 226) | the same two edits, character for character |
| `schemas/README.md` | end of the `schema_version` migration list (the `- **v2** …` bullet) | append the v2.1 note |
| `tests/fixtures/facts/entry-record.json` | 26 | `location` → `{kept_at, holder}` |
| `engine/tests/test_merge_facts_core.py` | 38 | `{"path": "p"}` → `{kept_at, holder}` |
| `engine/tests/test_merge_facts_apply.py` | 124, 507 | `{"path": "x"}` → `{kept_at, holder}` |
| `ui-backend/tests/test_facts_store.py` | 106 | `{"path": "…photo.jpg"}` → `{kept_at, holder}` |
| `ui-backend/tests/conftest.py` | 35 | `location: {}` → `{kept_at, holder}` |
| `ui-backend/tests/test_facts_api.py` | 88 | `location: {}` → `{kept_at, holder}` |
| `tests/test_facts_schema.py` | after 132 (`test_role_mirror_fails`) | the new tests |

Grepped for every record that carries a `medium`
(`grep -rn '"medium"' --include=*.json --include=*.py .`, minus `node_modules`,
`ui/design/mock` and `docs/postmortems`): the seven rows above are every
`paper` one in the tree. `native` (`engine/tests/facts_helpers.py:63`,
`engine/tests/fixtures/facts-plan/facts/records.json:24`, the data-repo's seed
`F-00001`) all carry `location: {}` and stay valid — see the `required` note
below. `external` appears nowhere outside the UI mock. `sheet` locations in the
tree are `{}`, `{spreadsheetId, sheet}`, `{spreadsheetId, sheetId, sheet}` and
the engine-written `{path, spreadsheetId, sheet}` — all four stay valid.

The frozen cooking fixture `engine/tests/fixtures/facts-plan/units/*.json`
carries **no** paper record (`u-wb-fried.json`'s two `new[]` entries are
`item`s) — nothing to update there.

#### Interfaces

Consumes: `recordData.medium ∈ {sheet, paper, external, native}` (unchanged),
and the `if`/`then` idiom the schema already uses at `$defs.source`
(`"if": {"required": ["quote"]}, "then": {…}`) and at `$defs.issue.fix`.

Produces — `recordData.location`, one branch per medium, every branch closed:

| `medium` | `location` | required |
|---|---|---|
| `sheet` | `{path, spreadsheetId, sheetId, sheet}` | — (engine-written; `build.py:628` writes `{path, spreadsheetId, sheet}`) |
| `paper` | `{kept_at: string, holder: string}` | **both** |
| `external` | `{system: string, kept_at: string}` | **both** |
| `native` | `{kept_at: string}` | — (see Notes) |

And `issue.kind` gains `"unread_attachment"` as the last member of the enum in
both files.

#### Step 1 (RED) — the tests

Insert into `tests/test_facts_schema.py` after `test_role_mirror_fails` (line 132):

```python
def test_a_paper_records_location_is_where_it_is_kept_and_who_holds_it(validate):
    """§3.3 — the paper branch is the controller's `{kept_at, holder}`. Two of
    the 2026-09-07 run's refusals were photographed forms written with no
    `location` at all, which an open `{"type": "object"}` could not refuse."""
    e = _load("entry-record.json")
    e["data"]["location"] = {}
    assert validate("facts.schema.json", _wrap(e)) != []
    e["data"]["location"] = {"kept_at": "زونکن دفتر آشپزخانه",
                             "holder": "سرآشپز شیفت"}
    assert validate("facts.schema.json", _wrap(e)) == []
    e["data"]["location"]["path"] = "departments/cooking/attachments/photo.jpg"
    assert validate("facts.schema.json", _wrap(e)) != []      # closed


def test_the_other_three_media_close_too(validate):
    e = _load("entry-record.json")
    e["data"]["medium"] = "external"
    e["data"]["location"] = {"system": "سپیدز", "kept_at": "شمارهٔ رسید"}
    assert validate("facts.schema.json", _wrap(e)) == []
    e["data"]["location"] = {"system": "سپیدز"}
    assert validate("facts.schema.json", _wrap(e)) != []      # kept_at required
    e["data"]["medium"] = "native"
    e["data"]["location"] = {"kept_at": "خود سامانه"}
    assert validate("facts.schema.json", _wrap(e)) == []
    e["data"]["location"] = {"holder": "کسی"}
    assert validate("facts.schema.json", _wrap(e)) != []      # closed


def test_a_sheet_records_location_keeps_its_engine_written_shape(validate):
    # `facts_plan.build` writes `{path, spreadsheetId, sheet}` and the dumps
    # that predate it wrote `{spreadsheetId, sheetId, sheet}`; both stay valid,
    # and so does the empty one a `new[]` record is allowed to leave.
    e = _load("entry-record-sheet.json")
    assert validate("facts.schema.json", _wrap(e)) == []
    e["data"]["location"] = {"path": "attachments/sheets/Pitza/pitza.xlsx",
                             "spreadsheetId": "1abc", "sheet": "پیتزا"}
    assert validate("facts.schema.json", _wrap(e)) == []
    e["data"]["location"] = {}
    assert validate("facts.schema.json", _wrap(e)) == []
    e["data"]["location"] = {"kept_at": "جایی"}
    assert validate("facts.schema.json", _wrap(e)) != []


def test_unread_attachment_is_an_issue_kind(validate):
    # I2 / §3.7: a file `extract-attachment` has no converter for is named,
    # never improvised over.
    e = _load("entry-record.json")
    e["data"]["location"] = {"kept_at": "زونکن", "holder": "سرآشپز"}
    e["issues"] = [{"kind": "unread_attachment", "description": "فایل خوانده نشد",
                    "affects": [{"ref": "F-00002"}]}]
    assert validate("facts.schema.json", _wrap(e)) == []
    assert validate("facts-delta.schema.json", _wrap(
        dict(e, id="T-1", data=dict(e["data"])))) != []       # store-only keys


def test_both_schemas_still_self_validate_and_agree_on_location(validate):
    """The two files are kept in step by hand; this asserts the one thing that
    matters here — `recordData` is byte-identical between them."""
    import json, pathlib
    root = pathlib.Path(__file__).resolve().parents[1] / "schemas"
    a = json.loads((root / "facts.schema.json").read_text(encoding="utf-8"))
    b = json.loads((root / "facts-delta.schema.json").read_text(encoding="utf-8"))
    assert a["$defs"]["recordData"] == b["$defs"]["recordData"]
    assert a["$defs"]["issue"]["properties"]["kind"] == \
        b["$defs"]["issue"]["properties"]["kind"]
```

The `validate` fixture (`tests/conftest.py:22`) already calls
`Draft202012Validator.check_schema`, so "both schema files still self-validate"
is asserted by every call above.

Run: `.venv/bin/pytest -q -k "paper_records_location or other_three_media or engine_written_shape or unread_attachment_is_an_issue or agree_on_location"`
→ 5 failed.

#### Step 2 (GREEN) — the schemas

In **both** files, append `"unread_attachment"` to the `issue.kind` enum:

```json
                            "ambiguous_row_header", "binding_gone",
                            "unread_attachment"] },
```

In **both** files, replace `"location": { "type": "object" },` inside
`recordData` with:

```json
        "location": { "type": "object" },
```

(unchanged — the per-medium narrowing lives in `allOf`, so `additionalProperties`
still sees `location` as a declared property) and append, as the last member of
the `recordData` object, after its `"properties": { … }` block:

```json
      "allOf": [
        { "if": { "properties": { "medium": { "const": "sheet" } },
                  "required": ["medium"] },
          "then": { "properties": { "location": {
            "type": "object", "additionalProperties": false,
            "properties": { "path": { "type": "string" },
                            "spreadsheetId": { "type": "string" },
                            "sheetId": { "type": ["integer", "string", "null"] },
                            "sheet": { "type": "string" } } } } } },
        { "if": { "properties": { "medium": { "const": "paper" } },
                  "required": ["medium"] },
          "then": { "properties": { "location": {
            "type": "object", "additionalProperties": false,
            "required": ["kept_at", "holder"],
            "properties": { "kept_at": { "type": "string" },
                            "holder": { "type": "string" } } } } } },
        { "if": { "properties": { "medium": { "const": "external" } },
                  "required": ["medium"] },
          "then": { "properties": { "location": {
            "type": "object", "additionalProperties": false,
            "required": ["system", "kept_at"],
            "properties": { "system": { "type": "string" },
                            "kept_at": { "type": "string" } } } } } },
        { "if": { "properties": { "medium": { "const": "native" } },
                  "required": ["medium"] },
          "then": { "properties": { "location": {
            "type": "object", "additionalProperties": false,
            "properties": { "kept_at": { "type": "string" } } } } } } ]
```

Each `if` carries `"required": ["medium"]` on purpose: without it the `if`
passes vacuously on a record that has no `medium` at all, and every branch's
`then` would fire at once.

#### Step 3 — the fixtures the closed branch invalidates

`tests/fixtures/facts/entry-record.json:26`:

```json
    "location": { "kept_at": "زونکن دفتر آشپزخانه", "holder": "سرآشپز شیفت" },
```

`engine/tests/test_merge_facts_core.py:38`:

```python
        "medium": "paper", "role": "log",
        "location": {"kept_at": "زونکن دفتر", "holder": "سرآشپز"},
```

`engine/tests/test_merge_facts_apply.py:124` and `:507` — both occurrences of
`"location": {"path": "x"}` become
`"location": {"kept_at": "زونکن دفتر", "holder": "سرآشپز"}`.

`ui-backend/tests/test_facts_store.py:106`:

```python
     "location": {"kept_at": "زونکن دفتر", "holder": "سرآشپز"},
```

`ui-backend/tests/conftest.py:35` and `ui-backend/tests/test_facts_api.py:88` —
both `"location": {}` on a `medium: paper` record become
`"location": {"kept_at": "زونکن دفتر", "holder": "سرآشپز"}`.

#### Step 4 — the migration note

Append to `schemas/README.md`, immediately after the `- **v2** (2026-09-06, …)`
bullet (append-only, as the section says):

```markdown
- **v2.1** (2026-09-07, v3 gate addendum §3.3/§3.7) — `record.location` closes:
  a `oneOf` keyed by `medium` (`sheet` → `{path, spreadsheetId, sheetId, sheet}`,
  engine-written and unchanged; `paper` → `{kept_at, holder}`, both required;
  `external` → `{system, kept_at}`, both required; `native` → `{kept_at}`), each
  branch `additionalProperties: false`. `issues[].kind` gains
  `unread_attachment` (I2 — a file `extract-attachment` has no converter for is
  named once, never improvised over). The `schema_version` constant stays at
  `2`: nothing about the *reader* changed, and every store and delta already in
  the tree validates under v2.1 except the paper records this commit migrates.
  `native.kept_at` is deliberately **not** required — the store's seed record
  `F-00001` and two run entries carry `location: {}`, and refusing them would
  make the live store unloadable for a field nobody has been asked for yet.
```

#### Step 5 (VERIFY)

```
.venv/bin/pytest -q -k "paper_records_location or other_three_media or engine_written_shape or unread_attachment_is_an_issue or agree_on_location"
```
→ `5 passed`.

```
.venv/bin/pytest -q tests engine/tests ui-backend/tests
```
→ the Task 1 pass count plus 5, no failures.

#### Step 5b — the quote admission admits attachment-derived sources (assembler's ruling 3)

In both schema files, `$defs.source`'s `then` branch — today `{"properties": {"type": {"enum": ["voice", "comment", "sheet", "process"]}}}` — gains `"docx"`, `"pdf"`, `"photo"`, so a form read from a `.docx`, a `.pdf` or a photograph may carry a `quote` like a transcript does. Test: duplicate the existing `test_quote_is_admitted_on_voice_and_refused_on_chat` in `tests/test_facts_schema.py` as `test_quote_is_admitted_on_an_attachment_source`, admitting `docx`, `pdf` and `photo` and still refusing `chat`. Run `.venv/bin/pytest -q -k "quote_is_admitted"` → 2 passed. Fold into this task's commit.

#### Step 6 (COMMIT)

```
git add schemas/facts.schema.json schemas/facts-delta.schema.json schemas/README.md \
        tests/fixtures/facts/entry-record.json tests/test_facts_schema.py \
        engine/tests/test_merge_facts_core.py engine/tests/test_merge_facts_apply.py \
        ui-backend/tests/conftest.py ui-backend/tests/test_facts_store.py \
        ui-backend/tests/test_facts_api.py
git commit -m "$(cat <<'EOF'
feat(schemas): record.location closes per medium; unread_attachment

`recordData.location` was `{"type": "object"}` — anything at all. Two paper
forms photographed in the 2026-09-07 meeting were written as records with no
`location` and invented keys, and nothing refused them until Stage V, after
both units had spent their attempts.

It is now a oneOf keyed by `medium`, every branch closed: `sheet` keeps the
engine-written shape, `paper` is `{kept_at, holder}` (the controller's ruling,
accepted by the owner), `external` is `{system, kept_at}`, `native` is
`{kept_at}`. `native.kept_at` is not required — the store's seed record
carries `location: {}` and refusing it would make the live store unloadable.

`issues[].kind` gains `unread_attachment` (I2). Both schema files move
together; `schemas/README.md` carries the v2.1 note. The seven paper-record
fixtures in the tree are migrated to the closed shape.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```

---

### Task 3: the unit gate materialises and validates (§3.1, §3.5)

I1: whatever a unit writes is validated at `validate facts-unit` against the
same per-entry contract `merge facts apply` enforces. A per-entry refusal after
the unit gate becomes a defect.

#### Files

| Path | Anchor | Change |
|---|---|---|
| `engine/facts_plan/assemble.py` | imports 18–25 | add `check_document` to the `merge_facts.content` import; add `iter_ref_objects` (already imported at 20–22) |
| | `validate_unit` 65–170 (returns at 170) | the attempt cap first; the materialised gate last |
| | new, above `_entry` (633) | `_state_for`, `_unit_labels` |
| | `_build_entries` 731–782 | extract its candidate loop into `_kept_entries` |
| | new, after `_kept_entries` | `materialise`, `_placeholder_refs` |
| `engine/facts_plan/cli.py` | `unit_states` 96–127 | **no change** — see Interfaces |
| `engine/tests/test_validate_facts_unit.py` | `_run` 11–35, `_doc` 38–47, and the three tests named in step 1 | kind-aware fixtures + the new tests |
| `engine/tests/test_facts_plan_assemble.py` | after `test_the_delta_is_schema_valid_and_survives_a_simulated_apply` (672–681) | the I1 invariant test |

#### Interfaces

Consumes:
- `engine_common.validate(schema_name, instance)` — Task 1's message
  (`"<schema> validation failed:\n<line>\n<line>"`).
- `merge_facts.content.check_document(doc, kind_of_file, store=None, unit_symbols=None) -> list[str]`
  — called exactly as `merge_facts/preconditions.py:294` calls it, with
  `kind_of_file="facts-delta"`, `store=load_store(root)` and
  `unit_symbols=skeleton["unit_symbols"]`.
- `merge_facts.load_store(root) -> {kind: {"schema_version", "entries"}}` —
  tolerates a root with no `facts/` (`__init__.py:33`), so the gate never dies
  on a fresh estate.
- `merge_facts.iter_ref_objects(obj)` — yields only dicts whose keys are a
  subset of `{ref, field, row}`, so a `source[]` member (`{type, ref, …}`) is
  never rewritten.
- `facts-delta.schema.json`'s `$defs.ref.ref` pattern is
  `^(F-[0-9]{5}|T-[0-9]+)$` — **it does not admit `S-`/`N-` handles**, which is
  why `materialise` has a `for_validation` mode.

Produces:

```python
def _kept_entries(by_id, state):
    """`{skeleton id (or `<id>#<n>` for a split part): entry}` — the bodies
    steps 2 and 6 build, before ids, refs and scopes. `_build_entries` and
    `materialise` both go through here so the unit's gate and the assembly
    cannot drift."""


def materialise(root, run_dir, doc, *, for_validation=True):
    """The entries a unit document would become, as a delta's `entries[]`.

    `for_validation=True` mints `T-1…T-n` over them and maps every `S-`/`N-`
    handle this one document cannot resolve to `T-0`: the delta schema's `ref`
    pattern is `^(F-[0-9]{5}|T-[0-9]+)$` and admits no handle, and cross-unit
    resolution is `assemble._resolve_refs`' job, not the gate's. The shape
    around the ref is what gets checked; the handle itself never is.
    """


def _state_for(root, run_dir, doc):
    """The `_entry` state one document needs: this run's department, issues,
    plan units and workbook paths, with the document's own decisions and
    `new[]` pseudo-candidates. A missing `attachments/sheets/manifest.json`
    costs a source's `ref` string, not the shape."""


def _unit_labels(doc):
    """`{skeleton handle: 'decisions[<n>] <id>' | 'new[<n>]'}` — the label
    `validate_unit`'s other messages already use, so a schema failure names the
    decision the unit has to go back to."""
```

`facts_plan/cli.py` needs **no diff** for §3.5: `unit_states:123` is already
`"failed" if len(attempts) >= 2 else "pending"`, so an `out.3.json` whose
`validate_unit` returns the cap message is `failed`; and `_outputs:318`'s
`elif len(attempts) < ATTEMPTS` already treats a third attempt as a failed unit
rather than refusing the run. Only `validate_unit` has to *say* it.

#### Step 1 (RED) — the tests

**(a) `engine/tests/test_validate_facts_unit.py` — the fixtures first.**
`_run`'s candidates carry `payload: {"output": "انحراف"}`, which `ruleData`
has no such key for, and `_doc`'s decision data is `{"inputs": [], "outputs": []}`
whatever the kind. Both were documents Stage V would have refused; the gate now
says so, so the fixtures have to become documents the store accepts. Replace
lines 11–47 with:

```python
#: What a candidate of each kind mechanically carries, and what a unit's `keep`
#: writes over it — the store's own shapes, since the gate now holds a unit
#: document to `facts-delta.schema.json` (I1). `output` is `render`, never
#: payload: `ruleData` has no such key, and `build.label_of` reads it there.
KINDS = {
    "rule": ({}, {"render": {"output": "انحراف"}}, {"inputs": [], "outputs": []}),
    "record": ({"medium": "sheet", "role": "log",
                "location": {"spreadsheetId": "SID", "sheet": "پیتزا"}},
               {"render": {"sheet": "پیتزا"}}, {"role": "log"}),
}


def _run(tmp_path, candidates=("S-r-000000000001",), kind="rule"):
    root = tmp_path
    (root / "departments" / "cooking" / "processes").mkdir(parents=True)
    (root / "departments" / "cooking" / "processes" / "cooking-030.json").write_text(
        json.dumps({"id": "cooking-030",
                    "nodes": [{"id": "cooking-030-n016", "label": "شمارش"}]}),
        encoding="utf-8")
    payload, extra, _ = KINDS[kind]
    run_dir = root / "runs" / "facts" / "cooking" / "20260906-101500"
    (run_dir / "units" / "u-wb-pitza").mkdir(parents=True)
    (run_dir / "skeleton.json").write_text(json.dumps(
        {"schema_version": 1, "department": "cooking", "run": "r",
         "unit_symbols": ["kg", "portion"],
         "candidates": [{"id": c, "kind": kind, "unit": "u-wb-pitza",
                         "payload": dict(payload), **extra}
                        for c in candidates],
         "instances": [], "imports": [], "issues": []}, ensure_ascii=False),
        encoding="utf-8")
    (run_dir / "plan.json").write_text(json.dumps(
        {"schema_version": 1, "department": "cooking", "hashes": {},
         "units": [{"id": "u-wb-pitza", "type": "workbook", "inputs": [],
                    "candidates": list(candidates), "nodes": [],
                    "est_tokens_in": 1, "est_tokens_out": 1},
                   {"id": "u-wb-other", "type": "workbook", "inputs": [],
                    "candidates": [], "nodes": [],
                    "est_tokens_in": 1, "est_tokens_out": 1}]}), encoding="utf-8")
    return root, run_dir


def _doc(kind="rule", **over):
    doc = {"schema_version": 1, "unit": "u-wb-pitza", "attempt": 1,
           "decisions": [{"skeleton": "S-r-000000000001", "action": "keep",
                          "key": "enheraf", "title": "انحراف مصرف",
                          "statement": "انحراف مصرف هر مادهٔ اولیه برابر است با "
                                       "مصرف واقعی منهای مصرف اعلامی لاین.",
                          "data": dict(KINDS[kind][2])}],
           "new": []}
    doc.update(over)
    return doc
```

Three existing tests then need their kind said out loud:

- `test_a_unit_written_on_a_non_numeric_field_is_an_error` (154): `_run(tmp_path,
  kind="record")` and `_doc("record")` — `fields[]` belong to a record, and on a
  rule the gate would (rightly) add a second message about `ruleData` having no
  `fields`.
- `test_sheet_words_belong_to_a_records_own_statement` (135): the record half
  uses `_doc("record")`; the rule half at 149–151 builds its own
  `rule_doc = _doc()` carrying the same `sentence` as `statement`, rather than
  re-writing the record document into a rule unit.
- `test_provisional_field_ref_shape` (118) is unchanged: `data["inputs"]` is a
  `ruleData` key, and the extra `'C_H' does not match …` line the schema now
  also produces satisfies the same `any("C_H" in p …)` assertion.

**(b) the new tests**, appended to `engine/tests/test_validate_facts_unit.py`:

```python
def test_a_field_type_the_store_has_no_such_thing_as_fails_at_the_unit_gate(tmp_path):
    """I1 — 30 of the 2026-09-07 run's 52 Stage V refusals were column types
    written as `text`. The unit that wrote it is told, by field path, while it
    still has an attempt."""
    root, run_dir = _run(tmp_path, kind="record")
    doc = _doc("record")
    doc["decisions"][0]["data"] = {
        "role": "log", "fields": [{"from": "c_h", "key": "masraf", "type": "text"}]}
    problems = validate_unit(root, run_dir, _write(run_dir, doc))
    assert any("decisions[0] S-r-000000000001" in p
               and "data.fields[0].type" in p
               and "'text' is not one of" in p for p in problems)
    doc["decisions"][0]["data"]["fields"][0]["type"] = "number"
    assert validate_unit(root, run_dir, _write(run_dir, doc, "out.2.json")) == []


def test_a_new_paper_record_without_a_location_fails_at_the_unit_gate(tmp_path):
    """§3.3 + I1 — the two photographed forms of the 2026-09-07 run, refused
    where the unit can still fix them."""
    root, run_dir = _run(tmp_path)
    form = {"kind": "record", "key": "mande_shab", "title": "فرم مانده شب",
            "statement": "فرم کاغذی مانده شب که هر شیفت پر می‌شود.",
            "data": {"medium": "paper", "role": "log"}}
    problems = validate_unit(root, run_dir,
                             _write(run_dir, _doc(new=[form])))
    assert any("new[0]" in p and "'location' is a required property" in p
               for p in problems)
    form["data"]["location"] = {"kept_at": "زونکن دفتر", "holder": "سرآشپز شیفت"}
    assert validate_unit(root, run_dir,
                         _write(run_dir, _doc(new=[form]), "out.2.json")) == []


def test_the_content_pass_runs_over_the_materialised_entries(tmp_path):
    """§3.1 step 3 — `check_document`, the same call `preconditions` makes, so
    a rule whose expr reads an identifier it never declared is refused here and
    not at Stage V."""
    root, run_dir = _run(tmp_path)
    doc = _doc()
    doc["decisions"][0]["data"] = {
        "expr": "enheraf = masraf_vaqei - masraf_elami", "lang": "feel",
        "inputs": [{"key": "masraf_vaqei"}],
        "outputs": [{"key": "enheraf"}]}
    assert any("masraf_elami" in p
               for p in validate_unit(root, run_dir, _write(run_dir, doc)))


def test_a_third_attempt_is_refused_by_the_cap(tmp_path):
    """§3.5 — two attempts per unit is the engine's rule, not the
    coordinator's. The 2026-09-07 run reached out.3.json and then asked the
    owner to lift the cap."""
    root, run_dir = _run(tmp_path)
    assert validate_unit(root, run_dir, _write(run_dir, _doc(), "out.3.json")) == \
        ["out.3.json: attempt cap: two per run"]
    assert validate_unit(root, run_dir, _write(run_dir, _doc(), "out.2.json")) == []


def test_status_reports_a_third_attempt_as_failed(tmp_path):
    from facts_plan.cli import unit_states
    root, run_dir = _run(tmp_path)
    for n in (1, 2, 3):
        _write(run_dir, _doc(), f"out.{n}.json")
    states = {s["id"]: s for s in
              unit_states(root, run_dir, [{"id": "u-wb-pitza", "type": "workbook"}])}
    assert states["u-wb-pitza"]["state"] == "failed"
```

**(c) the I1 invariant**, appended to `engine/tests/test_facts_plan_assemble.py`
after `test_the_delta_is_schema_valid_and_survives_a_simulated_apply` (line 681):

```python
def test_what_the_unit_gate_passes_is_never_refused_downstream(tmp_path):
    """I1 — a document `validate facts-unit` accepts is one `assemble` folds and
    `simulate` applies without a per-entry refusal. A refusal after the unit's
    gate is a defect, and this is the test that says so."""
    root = _root(tmp_path)
    _seed_units(root)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    for unit, name in (("u-a", "u-a"), ("u-b", "u-b")):
        assert validate_unit(root, run_dir,
                             run_dir / "units" / name / "out.1.json") == []
    assemble(root, run_dir)
    delta = run_dir / "facts-delta.json"
    validate("facts-delta.schema.json",
             json.loads(delta.read_text(encoding="utf-8")))
    _store, problems = simulate(root, delta, run_dir)
    assert problems == []
```

Run:
`.venv/bin/pytest -q -k "field_type_the_store or new_paper_record_without or content_pass_runs_over or third_attempt_is_refused or status_reports_a_third or never_refused_downstream"`
→ 5 failed, 1 passed (`never_refused_downstream` passes already — it is the
invariant, and it must stay green through the whole task).

#### Step 2 (GREEN) — `assemble.py`

**(i) the import at line 24** becomes:

```python
from merge_facts.content import check_document, lint_prose
```

**(ii) `_build_entries` (731)** — replace its candidate loop with a call.
The loop that is lifted is lines 736–755 (`kept = {}` through the `split`
branch). New function, placed immediately above `_build_entries`:

```python
def _kept_entries(by_id, state):
    """Steps 2 and 6's bodies, before ids, refs and scopes: `{skeleton id (or
    `<id>#<n>` for a split part): entry}`.

    `_build_entries` and `materialise` both come through here — that is the
    whole point of it existing (§3.1): the entry a unit is judged on at its
    gate is built by the code that builds the entry `assemble` folds, so the
    two cannot drift apart the way they did before the 2026-09-07 run.
    """
    kept = {}
    for cid, candidate in sorted(by_id.items()):
        decision = state["by_skeleton"].get(cid)
        label = label_of(candidate)
        if decision is None or candidate.get("unit") in state["failed"]:
            state["undecided"].append({"skeleton": cid, "kind": candidate["kind"],
                                       "label": label,
                                       "unit": candidate.get("unit")})
            continue
        if decision["action"] == "drop":
            state["dropped"].append({"skeleton": cid, "kind": candidate["kind"],
                                     "label": label,
                                     "reason_code": decision["reason_code"],
                                     "unit": decision["unit"]})
        elif decision["action"] == "keep":
            kept[cid] = _entry(candidate, decision, state)
        elif decision["action"] == "split":
            for n, part in enumerate(decision["into"], start=1):
                kept[f"{cid}#{n}"] = _entry(candidate, decision, state, part=part)
    return kept
```

and `_build_entries`' body becomes:

```python
    by_id = {c["id"]: c for c in skeleton["candidates"] + state["new"]}
    state["candidates"] = by_id
    state["dropped"], state["undecided"], state["provenance"] = [], [], {}
    kept = _kept_entries(by_id, state)
    for cid in sorted(state["by_skeleton"], …          # unchanged from here on
```

**(iii) the one-document state and the materialiser**, after `_kept_entries`:

```python
def _state_for(root, run_dir, doc):
    """The `_entry` state one unit document needs, read off the run.

    Only this unit's candidates and this document's decisions: a candidate of a
    sibling unit has no decision here and would land in `undecided[]`, which is
    `assemble`'s bookkeeping and not the gate's.
    """
    root, run_dir = pathlib.Path(root), pathlib.Path(run_dir)
    skeleton, plan = read_json(run_dir / "skeleton.json"), read_json(run_dir / "plan.json")
    unit = doc["unit"]
    by_id = {c["id"]: c for c in skeleton["candidates"] if c.get("unit") == unit}
    by_skeleton = {}
    for decision in doc["decisions"]:
        if decision.get("skeleton"):
            by_skeleton[decision["skeleton"]] = dict(decision, unit=unit)
    for n, entry in enumerate(doc.get("new") or []):
        handle, candidate, decision = _pseudo(entry, unit, n)
        by_id[handle], by_skeleton[handle] = candidate, decision
    # A run always has a manifest; a test estate and a fresh department may not,
    # and a missing one costs a `source[].ref` string, never a shape.
    manifest = root / "attachments" / "sheets" / "manifest.json"
    workbooks = read_json(manifest)["workbooks"] if manifest.is_file() else []
    return by_id, {
        "by_skeleton": by_skeleton, "new": [], "failed": set(),
        "dropped": [], "undecided": [], "provenance": {},
        "department": skeleton["department"], "issues": skeleton["issues"],
        "candidates": by_id,
        "units": {u["id"]: u for u in plan["units"]},
        "paths": {w["spreadsheetId"]: f'attachments/sheets/{w["dir"]}/{w["file"]}'
                  for w in workbooks}}


def _placeholder_refs(entries):
    """1a's cross-unit half, which the gate does not do: a handle this one
    document resolves becomes that entry's temp id, and every other one becomes
    `T-0`. The delta schema's ref pattern is `^(F-[0-9]{5}|T-[0-9]+)$` and
    admits no `S-`/`N-` handle, so without this every cross-unit ref would read
    as a shape error the unit cannot fix. `T-0` is nobody's id, so
    `check_document` treats it as cross-store and leaves it alone — exactly what
    it does with an `F-` ref it cannot see (`content._check_unit_edges`).
    """
    by_skeleton = {e["_skeleton"]: e["id"] for e in entries}
    for entry in entries:
        for obj in iter_ref_objects(entry):
            ref = obj.get("ref")
            if isinstance(ref, str) and ref.startswith(("S-", "N-")):
                obj["ref"] = by_skeleton.get(ref, "T-0")


def materialise(root, run_dir, doc, *, for_validation=True):
    """The entries one unit document would become (§3.1 step 1).

    `for_validation` mints `T-1…T-n` and settles the handles (`_placeholder_refs`)
    so the list is a delta's `entries[]`; the private `_skeleton`/`_unit`/
    `_renames` keys stay on, and the caller strips them — `validate_unit` needs
    `_skeleton` to name the decision an error belongs to.
    """
    by_id, state = _state_for(root, run_dir, doc)
    entries = list(_kept_entries(by_id, state).values())
    entries.sort(key=lambda e: (KIND_ORDER.index(e["kind"]),
                                e["_skeleton"], e["key"]))
    if for_validation:
        for n, entry in enumerate(entries, start=1):
            entry["id"] = f"T-{n}"
        _placeholder_refs(entries)
    return entries


def _unit_labels(doc):
    """`{handle: the label validate_unit's other messages already use}`."""
    out = {f'N-{doc["unit"]}-{n}': f"new[{n}]"
           for n, _ in enumerate(doc.get("new") or [])}
    for n, decision in enumerate(doc["decisions"]):
        if decision.get("skeleton"):
            out[decision["skeleton"]] = f'decisions[{n}] {decision["skeleton"]}'
    return out
```

**(iv) `validate_unit`** — the cap goes in before anything else, right after the
`root, run_dir, path = …` line at 76:

```python
    # §3.5 — two attempts per unit is a rule of the engine. The 2026-09-07 run
    # reached out.3.json and then asked the owner to lift the cap; `unit_states`
    # and `_outputs` already read a third attempt as `failed`, they were only
    # never told why.
    attempt = re.fullmatch(r"out\.([0-9]+)\.json", path.name)
    if attempt and int(attempt.group(1)) > ATTEMPTS:
        return [f"{path.name}: attempt cap: two per run"]
```

(`re` is imported at line 15; `ATTEMPTS = 2` is at 243 — move nothing, it is
module-level and `validate_unit` runs at call time.)

and the new gate replaces the `return problems` at 170:

```python
    # I1 (§3.1) — the output side closes here. Whatever the unit wrote, from
    # whatever evidence, is held to the contract `merge facts apply` enforces:
    # the store schema per kind, then the content pass. A per-entry refusal
    # after this point is a defect, not a finding.
    #
    # The review is not materialised: it decides assembled entries, which do not
    # exist until `assemble` has run, and rebuilding the draft here would make
    # every `facts-plan status` call re-run the assembly once per unit.
    if doc["unit"] != "review" and not problems:
        problems += _gate(root, run_dir, doc)
    return problems


def _gate(root, run_dir, doc):
    """§3.1 steps 2–3 over the materialised entries: the store schema per kind,
    then `check_document` exactly as `merge_facts.preconditions` runs it. Every
    message names the decision, never the entry index the unit never wrote."""
    skeleton = read_json(pathlib.Path(run_dir) / "skeleton.json")
    entries = materialise(root, run_dir, doc)
    labels = _unit_labels(doc)
    named = [labels.get(e["_skeleton"], e["_skeleton"]) for e in entries]
    clean = [{k: v for k, v in e.items() if not k.startswith("_")} for e in entries]
    delta = {"schema_version": 2, "entries": clean}
    out = []
    try:
        validate("facts-delta.schema.json", delta)
    except ValueError as exc:
        # `entries[3].data.fields[2].type: …` → `decisions[1] S-…: data.…`, so
        # the unit is told which of ITS decisions to go back to (§3.1 step 2).
        for line in str(exc).splitlines()[1:]:
            out.append(_renamed(line, named))
    for message in check_document(delta, "facts-delta", load_store(root),
                                  unit_symbols=skeleton.get("unit_symbols") or []):
        out.append(message)
    return out


#: `entries[3]` / `entries[N]` at the head of a §3.4 line, and the concrete
#: paths inside its `(n places: …)` tail.
_ENTRY_AT = re.compile(r"entries\[([0-9]+|N)\]")


def _renamed(line, named):
    """§3.4's line with every `entries[<i>]` replaced by the decision that wrote
    it. `entries[N]` — the generalised head of a grouped line — has no one
    decision, so it keeps its shape and the `(n places: …)` tail names them."""
    def swap(match):
        n = match.group(1)
        return f"{named[int(n)]}:" if n != "N" and int(n) < len(named) else "entries[N]"
    return _ENTRY_AT.sub(swap, line).replace(":.", ": ")
```

#### Step 3 (VERIFY)

```
.venv/bin/pytest -q -k "field_type_the_store or new_paper_record_without or content_pass_runs_over or third_attempt_is_refused or status_reports_a_third or never_refused_downstream"
```
→ `6 passed`.

```
.venv/bin/pytest -q engine/tests/test_validate_facts_unit.py engine/tests/test_facts_plan_assemble.py engine/tests/test_facts_plan_status.py engine/tests/test_facts_plan_fixture.py
```
→ no failures. `test_facts_plan_fixture.py` drives the frozen cooking estate
through `build` + `assemble`; it is the one that says the gate did not start
refusing the real run's three unit documents.

```
.venv/bin/pytest -q engine/tests tests ui-backend/tests
```
→ no failures.

#### Step 3b — attachment sources cite their real type; the paper location is prose (assembler's rulings 2 and 3)

(a) `assemble._unit_sources` (around line 556) cites `{"type": "voice"}` for every `.txt`/`.md` input a unit carries. Choose the type by the sidecar's suffix when the input lies under `departments/<d>/attachments/.text/`: `.txt` → `docx`, `.pdf.md` → `pdf`, `.image.md` → `photo`; `ref` is the sidecar path; transcripts under `meetings/transcripts/` stay `voice`. Test in `engine/tests/test_facts_plan_assemble.py`: a unit whose plan `inputs` list a `.image.md` sidecar yields a `new[]` record whose `source[0]` is `{"type": "photo", "ref": "<the sidecar path>"}`; a transcript input still yields `voice`.

(b) `kept_at`, `holder` and `system` under `data.location` are prose: `_lint_decision` (assemble.py ~188) walks them like `grain`/`method`/`exceptions`, and `content._check_prose`'s record branch does the same, so the unit gate and `apply` agree. Test: a `new[]` paper record whose `kept_at` is «در سلول J6 دفتر آشپزخانه» is refused at the unit gate with the field path `data.location.kept_at`; the same record with «در دفتر سرآشپز، کشوی اول» passes. Fold both into this task's commit.

#### Step 4 (COMMIT)

```
git add engine/facts_plan/assemble.py engine/tests/test_validate_facts_unit.py \
        engine/tests/test_facts_plan_assemble.py
git commit -m "$(cat <<'EOF'
feat(facts-plan): the unit gate materialises its entries and validates them

I1 of the v3 gate addendum: whatever a unit writes is now held, at
`validate facts-unit`, to the contract `merge facts apply` enforces. On
2026-09-07 fourteen units and the review passed their gates and Stage V then
refused 52 of the 220 entries on shape alone — column types written as `text`,
rules with no `outputs`, paper forms with no `location`. Nothing was wrong with
the content; the units were simply never shown the contract.

`materialise(root, run_dir, doc)` builds the entries a document would become
through the same `_entry`/`_pseudo` path `assemble` uses — both now go through
`_kept_entries`, so they cannot drift. `validate_unit` validates them as a
delta against `facts-delta.schema.json` and runs `check_document` with the
store and the run's unit symbols, exactly as `preconditions` does. Errors are
renamed from `entries[3]` to the decision that wrote them.

Handles that point at another unit's candidate become `T-0`: the delta ref
pattern admits no `S-`/`N-` form, and cross-unit resolution stays in
`assemble._resolve_refs`. The review document is not materialised — it decides
entries that do not exist until the assembly runs.

`out.<n>.json` with n > 2 is refused with `attempt cap: two per run`;
`unit_states` and `_outputs` already read a third attempt as failed, they were
only never told why.

The unit-gate fixtures carried a rule payload with an `output` key and a
record decided with `inputs`/`outputs` — documents the store would have
refused. They are the shapes they claim to be now.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```

---

#### Drafting notes (kept for the executor)

**Names invented here** (nothing in the addendum spells them):

- `_kept_entries(by_id, state) -> dict` — the shared core §3.1 asks for. The
  addendum names `materialise` as "the shared function used by both
  `validate_unit` and `_build_entries`", but `_build_entries` works over the
  whole run's merged decision set and then merges, resolves and scopes, while
  `materialise` works over one document; the honest shared unit is the
  candidate loop. `materialise` is a thin wrapper over it, and both reach
  `_entry` through it, which is what "cannot drift" means.
- `_state_for`, `_unit_labels`, `_placeholder_refs`, `_gate`, `_renamed` in
  `assemble.py`; `_path`, `_entry_branches`, `_branch_of`, `_expand`,
  `_error_lines`, `LINE_CAP`, `_SCHEMAS` in `engine_common`.
- The cap message is exactly `out.3.json: attempt cap: two per run` — the
  addendum gives the body, the `<filename>: ` prefix is `validate_unit`'s own
  convention for every other message it returns.

**Where the addendum and the code disagree:**

1. §3.4's cap line is given as `… و N مورد دیگر` / `… and N more`. Every other
   engine message is English (Persian is for `gate-b.md`, `report.md` and the
   bot); this plan uses `… and N more` only.
2. §3.7 says `unread_attachment` is a **skeleton** issue with `run_only: true`.
   `skeleton.json` has no schema — only `facts.schema.json`/`facts-delta.schema.json`
   carry an `issue.kind` enum, and a `run_only` issue never reaches an entry
   (`_entry` at 651 skips them). Adding it to the store enums is still right
   (`ISSUE_FA`/`ISSUE_TEXT` and `report` need the vocabulary to agree), but it
   is not what enforces it — Task 4's `build` change is.
3. §3.3 calls `sheet` "unchanged, engine-written" and lists `{path,
   spreadsheetId, sheet}`. The tree also holds `{spreadsheetId, sheetId, sheet}`
   (`tests/fixtures/facts/entry-record-sheet.json:30`) and `{}` (a `new[]`
   record, `test_facts_plan_assemble.py:144`). The sheet branch therefore closes
   the key set but requires nothing. Same reason `native.kept_at` is not
   required: the live store's seed `F-00001` and two data-repo run entries carry
   `location: {}`, and `save_store` validates the whole store.
4. §3.3 says the paper `kept_at`/`holder` are "Persian prose (linted)". Nothing
   lints them: `content._check_prose` reads `title`/`statement` and
   `assemble.PROSE_IN_DATA` is `("grain", "method", "exceptions")`. Adding them
   is a one-line change to `PROSE_IN_DATA` and belongs with the shape card
   (Task 4), not here.
5. The addendum's §3.1 has the review going through the same materialisation.
   It is **not** implemented in Task 3, on purpose: the review decides assembled
   entries, so materialising it means running `_prepare` + `_build_entries` +
   `_cross_unit`, and `facts_plan.cli.unit_states` calls `validate_unit` once
   per unit on every `status`. Whoever picks it up should materialise the review
   *inside* `_prepare` (where the draft already exists) rather than inside
   `validate_unit`.
6. `check_document`'s `_check_prose` now runs over the materialised entries as
   well as `_lint_decision` running over the decisions, so a bad sentence
   produces two messages with different labels. `content.group_messages` (which
   `validate/cli.py:39` already applies) folds them onto one line, so the agent
   sees one rule. Left as is rather than deduplicated.
7. `tests/test_facts_schema.py` does **not** diff the two schemas' `$defs` — no
   such test exists anywhere in the tree (`grep -rln '\$defs' tests engine/tests`
   → nothing). Task 2 adds the narrow version of it
   (`test_both_schemas_still_self_validate_and_agree_on_location`), covering
   `recordData` and `issue.kind` only; the sanctioned differences between the
   two files (`tempId`, `accounts[].id`, `status`, `updated_at`,
   `original`/`original_ref`, `source.hash`/`run`, `row.required`) are asserted
   one by one by the existing tests at lines 68–75 and 153–162.

**Names Tasks 4–7 consume:**

- `facts_plan.assemble.materialise(root, run_dir, doc, *, for_validation=True) -> list[dict]`
  — entries carry `_skeleton`, `_unit`, `_renames` and (under `for_validation`)
  `id`; strip the `_` keys before writing anything.
- `facts_plan.assemble._kept_entries(by_id, state) -> dict` — the one place an
  entry body is built. Anything that has to build entries goes through it.
- The error-line format (`engine_common._error_lines`):
  `<path>: <rule>` for one occurrence, and
  `<path with [N]>: <rule> (<n> places: <p1>, <p2>, <p3>)` for more, capped at
  `engine_common.LINE_CAP` (80) with `… and N more`. `validate` raises them
  under the header `"<schema name> validation failed:"`, one per line.
- The `location` shapes, exactly as the shape card (§3.2) must render them:
  `sheet` `{path, spreadsheetId, sheetId, sheet}` (none required),
  `paper` `{kept_at, holder}` (both required),
  `external` `{system, kept_at}` (both required),
  `native` `{kept_at}` (not required). Every branch closed.
- The issue kind is `unread_attachment`, last member of `issue.kind` in both
  `facts.schema.json` and `facts-delta.schema.json`. It needs an `ISSUE_TEXT`
  and an `ISSUE_FA` entry (`facts_plan/build.py:239`, `assemble.py:270`) —
  `engine/tests/test_facts_plan_report.py:15` asserts the two key sets are equal
  and `test_facts_plan_build.py:186` asserts every `ISSUE_TEXT` kind is
  reachable from the mini estate, so Task 4 owes the fixture a `.xyz` file.
- The attempt-cap message: `f"{path.name}: attempt cap: two per run"`.

---

### Task 4a: the shape section, generated from the schema (addendum §3.2)

**Files:**
- Modify: `engine/facts_plan/build.py:21` (the `engine_common` import line)
- Modify: `engine/facts_plan/build.py:1717-1723` (below `cards()` — the new renderer goes here,
  beside the other thing a unit is allowed to read)
- Modify: `engine/facts_plan/build.py:1784` (`out += ["", expression, "", style]` in `render_input`)
- Modify: `engine/facts_plan/assemble.py:955-978` (`_digest_text`)
- Test: `engine/tests/test_facts_plan_cards.py` (append; it is already "the cards the unit reads")
- Test: `engine/tests/test_facts_plan_units.py:~230` (one assertion inside
  `test_build_writes_the_four_artefacts_over_the_mini_estate`)

**Interfaces:**
- Consumes: `engine_common.read_json`, `engine_common.schema_dir` (returns `pathlib.Path`;
  `SCHEMA_DIR` overrides it); `facts_plan.build.estimate_tokens(text) -> int`;
  Task 2's `recordData.allOf` shape above.
- Produces:
  - `facts_plan.build.KIND_DATA: dict[str, str]` — `{"item": "itemData", "record": "recordData",
    "measurement": "measurementData", "rule": "ruleData", "note": "noteData"}`, in the order the
    card prints its sections.
  - `facts_plan.build.WRITABLE_KINDS: tuple[str, ...]` — the kinds a unit may write; `("item",
    "record", "measurement", "rule", "note")`. Every unit may write any kind, because §2.5's
    `new[]` row puts no restriction on which unit mints a `new` entry (the frozen
    `u-wb-fried.json` mints two `place` items from a *workbook* unit), and `measurement`/`note`
    are `new`-only for every unit alike.
  - `facts_plan.build.EXAMPLES: list[dict]` — three `new[]`-shaped entries
    (`{kind, key, title, statement, data}`): a paper record, a measurement, a rule.
  - `facts_plan.build.shape_card(kinds, schema) -> str` — the rendered section, ending in a
    newline-free string, for the kinds in `kinds` (any iterable; order comes from `KIND_DATA`).
  - `facts_plan.build.shape_section() -> str` — `shape_card(WRITABLE_KINDS, …)` over the schema
    read from `schema_dir()`; what `render_input` and `_digest_text` call.

---

- [ ] **Step 1: Write the failing tests**

Append to `engine/tests/test_facts_plan_cards.py`:

```python
def _schema():
    from engine_common import read_json, schema_dir
    return read_json(schema_dir() / "facts.schema.json")


def _enums_and_required(node, defs, seen):
    """Every `enum` value and every `required` key reachable from `node`."""
    name = (node.get("$ref") or "").rsplit("/", 1)[-1] or None
    if name:
        if name in seen:
            return [], []
        seen, node = seen | {name}, defs[name]
    enums = list(node.get("enum") or [])
    required = list(node.get("required") or [])
    children = list((node.get("properties") or {}).values())
    if isinstance(node.get("items"), dict):
        children.append(node["items"])
    for key in ("oneOf", "anyOf", "allOf"):
        children += list(node.get(key) or [])
    for key in ("if", "then"):
        if isinstance(node.get(key), dict):
            children.append(node[key])
    for child in children:
        more_enums, more_required = _enums_and_required(child, defs, seen)
        enums += more_enums
        required += more_required
    return enums, required


def test_the_shape_card_agrees_with_the_schema():
    """The card is the contract the unit is shown and `validate facts-unit` is
    the contract it is held to; a value in one and not the other is the 2026-09-07
    run again. So every enum value and every required key of the five payloads
    has to appear in the rendered card."""
    from facts_plan.build import KIND_DATA, WRITABLE_KINDS, shape_card
    schema = _schema()
    card = shape_card(WRITABLE_KINDS, schema)
    for kind, data_def in KIND_DATA.items():
        enums, required = _enums_and_required(
            {"$ref": f"#/$defs/{data_def}"}, schema["$defs"], set())
        for value in enums:
            if value is None:
                continue
            assert str(value) in card, f"{kind}: enum value {value!r}"
        for key in required:
            assert key in card, f"{kind}: required key {key!r}"


def test_the_shape_card_spells_location_out_per_medium():
    """§3.3 — the paper form is the case the first run had no shape for."""
    from facts_plan.build import shape_card
    card = shape_card(("record",), _schema())
    assert "medium=paper: holder*، kept_at*" in card
    assert "medium=sheet: path*، sheet*، spreadsheetId*" in card
    assert "medium=external: kept_at*، system*" in card
    assert "medium=native: kept_at*" in card


def test_the_three_worked_examples_validate_against_the_store_contract():
    """The examples are what a unit copies. One that does not validate teaches
    the shape Stage V refuses."""
    from engine_common import validate
    from facts_plan.build import EXAMPLES
    assert [e["kind"] for e in EXAMPLES] == ["record", "measurement", "rule"]
    assert EXAMPLES[0]["data"]["medium"] == "paper"
    assert set(EXAMPLES[0]["data"]["location"]) == {"kept_at", "holder"}
    validate("facts-delta.schema.json", {"schema_version": 2, "entries": [
        dict(entry, scope={"departments": ["cooking"], "branches": []},
             source=[{"type": "chat", "ref": None}], retired=False)
        for entry in EXAMPLES]})


def test_the_two_schemas_carry_the_same_payload_definitions():
    """The card renders from `facts.schema.json`; the unit gate validates
    against `facts-delta.schema.json`. The five payloads have to be one
    definition in two files, or the card documents a contract nothing enforces."""
    from engine_common import read_json, schema_dir
    from facts_plan.build import KIND_DATA
    store = read_json(schema_dir() / "facts.schema.json")["$defs"]
    delta = read_json(schema_dir() / "facts-delta.schema.json")["$defs"]
    for data_def in KIND_DATA.values():
        assert store[data_def] == delta[data_def], data_def


def test_the_shape_card_stays_inside_a_unit_s_budget():
    """It is appended to every `units/*/input.md`, so its size is a standing
    charge on the 20 K input budget (§2.3). This is the alarm, not a target:
    when the schema grows past it, someone decides what the card drops."""
    from facts_plan.build import (MAX_LINE, WRITABLE_KINDS, estimate_tokens,
                                  shape_section)
    text = shape_section()
    assert 1200 <= estimate_tokens(text) <= 3500
    assert max(len(line) for line in text.split("\n")) <= MAX_LINE
    assert shape_section() == text                       # deterministic
    assert "Shape card" in text and set(WRITABLE_KINDS)


def test_render_input_carries_the_shape_section_after_the_expression_card():
    from facts_plan.build import render_input
    skeleton = {"unit_symbols": [], "candidates": [], "instances": []}
    unit = {"id": "u-tr-x-l1", "type": "transcript", "inputs": [],
            "candidates": [], "nodes": [], "est_tokens_in": 0,
            "est_tokens_out": 0}
    text = render_input(unit, skeleton, {})
    assert text.index("Expression card") < text.index("Shape card")
    assert text.index("Shape card") < text.index("Style card")
    assert "medium=paper: holder*، kept_at*" in text
```

- [ ] **Step 2: Run them to verify they fail**

Run: `.venv/bin/pytest -q -k "shape_card or worked_examples or payload_definitions"`
Expected: FAIL — `ImportError: cannot import name 'KIND_DATA' from 'facts_plan.build'`.

- [ ] **Step 3: Add the renderer to `engine/facts_plan/build.py`**

Change the import at line 21 from

```python
from engine_common import read_json, write_json_atomic, write_text_atomic
```

to

```python
from engine_common import (read_json, schema_dir, write_json_atomic,
                           write_text_atomic)
```

Insert the following immediately after `cards()` (after line 1723, before
`def _render_candidate`):

```python
# --------------------------------------------------------------------------
# the shape card (§3.2) — the store's closed contract, rendered from the schema
# it is checked against. The 2026-09-07 run refused 52 entries on shape alone
# because the unit was shown the expression and style cards and never the
# payload; a card typed out by hand would have drifted from the checker inside
# a release, so this is generated and the test holds it to the schema.

#: The `$defs` name of each kind's payload, in the order the card prints them.
KIND_DATA = {"item": "itemData", "record": "recordData",
             "measurement": "measurementData", "rule": "ruleData",
             "note": "noteData"}

#: The Persian word for each kind — the section headings are read by a model
#: writing Persian prose, so the heading names the thing in both languages.
KIND_FA = {"item": "قلم", "record": "جدول یا فرم", "measurement": "اندازه‌گیری",
           "rule": "قاعده", "note": "یادداشت"}

#: Every kind a unit may write. §2.5's `new[]` row restricts no unit to a kind
#: — the frozen `u-wb-fried.json` mints two `place` items from a workbook unit —
#: so every unit is shown all five.
WRITABLE_KINDS = ("item", "record", "measurement", "rule", "note")

#: `$defs` that are one line wherever they appear. Spelling `ref` out at each of
#: its twenty sites tripled the card and taught nothing the first site did not.
TERSE = {"ref": '{"ref": "S-…"} (+ field, row)',
         "refOrNull": '{"ref": "S-…"} or null',
         "procRef": '{"ref": "cooking-030"}',
         "localCell": "{field, row}",
         "mintedKey": "key", "mintedSegment": "segment",
         "factId": "F-00001", "jalali": "1405-05-26",
         "iso": "2026-09-07T10:00:00Z"}


def _def_name(node):
    """The `$defs` name a node refers to, or `None` for an inline node."""
    return (node.get("$ref") or "").rsplit("/", 1)[-1] or None


def _deref(node, defs, seen):
    """The definition a `$ref` names, unless it is one of the short forms or one
    this branch already spelled out — those stay a `$ref` for `_atom` to print,
    which is also what stops a recursive `$defs` graph from recursing."""
    name = _def_name(node)
    if name and name not in TERSE and name not in seen:
        return defs[name], seen | {name}
    return node, seen


def _atom(node, seen):
    """One line's worth of a node, or `None` when it needs a block of its own."""
    name = _def_name(node)
    if name in TERSE:
        return TERSE[name]
    if name:
        return f"→ {name}, as above"
    if "enum" in node:
        return "one of " + " | ".join("null" if v is None else str(v)
                                      for v in node["enum"])
    if node.get("oneOf"):
        parts = [_atom(branch, seen) for branch in node["oneOf"]]
        return " or ".join(parts) if all(p is not None for p in parts) else None
    if node.get("properties"):
        return None
    kind = node.get("type")
    if kind == "array":
        return None
    return " | ".join(kind) if isinstance(kind, list) else (kind or "any")


def _block(node, defs, indent, seen):
    """Every key of one closed object, sorted, required ones marked `*`."""
    required = set(node.get("required") or [])
    out = []
    for key, sub in sorted((node.get("properties") or {}).items()):
        mark = "*" if key in required else " "
        sub, sub_seen = _deref(sub, defs, seen)
        tail = ""
        if sub.get("type") == "array":
            tail = "[]"
            sub, sub_seen = _deref(sub.get("items") or {}, defs, sub_seen)
        atom = _atom(sub, sub_seen)
        if atom is not None:
            out.append(f"{indent}{mark} {key}{tail}: {atom}")
            continue
        if sub.get("oneOf"):
            # A leaf the schema gives more than one shape (`ruleInput.from`):
            # every shape is spelled, because the one the card leaves out is the
            # one the unit invents a key for.
            out.append(f"{indent}{mark} {key}{tail}: one of these shapes —")
            for choice in sub["oneOf"]:
                choice, choice_seen = _deref(choice, defs, sub_seen)
                one = _atom(choice, choice_seen)
                if one is not None:
                    out.append(f"{indent}    - {one}")
                else:
                    out.append(f"{indent}    -")
                    out += _block(choice, defs, indent + "      ", choice_seen)
            continue
        out.append(f"{indent}{mark} {key}{tail}:")
        out += _block(sub, defs, indent + "    ", sub_seen)
    return out


def _location_lines(record, indent):
    """§3.3's `location`, one line per `medium` — read off the `if`/`then` pairs
    the schema chooses the shape with, never a table typed here."""
    out = [f"{indent}location, by medium:"]
    for branch in record.get("allOf") or []:
        medium = ((branch.get("if") or {}).get("properties")
                  or {}).get("medium", {}).get("const")
        shape = ((branch.get("then") or {}).get("properties") or {}).get("location")
        if not medium or not shape:
            continue
        required = set(shape.get("required") or [])
        out.append(f"{indent}  medium={medium}: " + "، ".join(
            key + ("*" if key in required else "")
            for key in sorted(shape.get("properties") or {})))
    return out


#: Three `new[]` entries a unit can copy — a paper form (the case the first run
#: had no shape for), a measurement, and a rule reading its parameters. A test
#: validates all three against `facts-delta.schema.json`, so an example the
#: schema would refuse cannot ship.
EXAMPLES = [
    {"kind": "record", "key": "form_tahvil_anbar",
     "title": "فرم تحویل کالا از انبار",
     "statement": "فرم کاغذی که هنگام تحویل هر قلم از انبار به لاین پر می‌شود و "
                  "مقدار تحویلی و تحویل‌گیرنده را ثبت می‌کند.",
     "data": {"medium": "paper", "role": "log",
              "location": {"kept_at": "دفتر انبار", "holder": "سرپرست انبار"},
              "cadence": "daily", "grain": "هر تحویل",
              "filled_by": "انباردار", "approved_by": "سرپرست آشپزخانه",
              "blank_master": True,
              "fields": [
                  {"key": "tarikh", "title": "تاریخ", "type": "date"},
                  {"key": "qalam", "title": "نام کالا", "type": "string",
                   "refItems": {"namespace": "##", "resolved_by": "title"}},
                  {"key": "meqdar", "title": "مقدار", "type": "number",
                   "unit": "kg"},
                  {"key": "tahvil_girande", "title": "تحویل‌گیرنده",
                   "type": "string"}],
              "signatures": [{"role": "انباردار"},
                             {"role": "سرپرست آشپزخانه"}],
              "primaryKey": ["tarikh", "qalam"]}},
    {"kind": "measurement", "key": "vazn_morgh_vorudi",
     "title": "وزن مرغ ورودی",
     "statement": "وزن هر محموله مرغ هنگام تحویل با ترازوی انبار اندازه گرفته "
                  "می‌شود و در فرم تحویل ثبت می‌شود.",
     "data": {"quantity": "mass", "unit": "kg",
              "method": "ترازوی دیجیتال انبار", "when": "هنگام تحویل محموله",
              "by": "انباردار",
              "exceptions": "محموله‌های بسته‌بندی‌شده با وزن چاپی دوباره وزن "
                            "نمی‌شوند."}},
    {"kind": "rule", "key": "enheraf_ba_tolerance",
     "title": "انحراف مصرف با تلورانس",
     "statement": "انحراف مصرف هر ماده اولیه پس از کسر تلورانس مجاز به دست "
                  "می‌آید؛ مقدار مثبت یعنی مصرف بیش از انتظار بوده است.",
     "data": {"lang": "feel",
              "expr": "enheraf_ba_tolerance = enheraf - tolerance_gr / 1000 * basis",
              "inputs": [
                  {"key": "enheraf", "title": "انحراف مصرف", "unit": "kg"},
                  {"key": "tolerance_gr", "title": "تلورانس", "unit": "g",
                   "from": {"param": "tolerancePerFoodGr"}},
                  {"key": "basis", "title": "مبنای تلورانس",
                   "from": {"param": "ref_1"}}],
              "outputs": [{"key": "enheraf_ba_tolerance",
                           "title": "انحراف با تلورانس", "unit": "kg",
                           "nature": "observed"}]}}]


def shape_card(kinds, schema):
    """The shape section (§3.2) for `kinds`, rendered from `schema`.

    The agent's rule, stated at the top of the card: a key not listed here is
    refused. Everything below the heading is generated — the key lists, the
    required marks, the enums, the column types, `location` per medium — so the
    card and `validate facts-unit` cannot disagree.
    """
    defs = schema["$defs"]
    wanted = set(kinds)
    out = ["# Shape card", "",
           "The store's closed contract, rendered from the schema this unit's",
           "output is checked against. A key not listed here is refused — no key",
           "is invented, and a value outside an enum is refused with it.",
           "`*` marks a required key; `key` is a minted key (`a_b__c_d`),",
           "`segment` one segment of it (`a_b`).", ""]
    for kind, data_def in KIND_DATA.items():
        if kind not in wanted:
            continue
        data = defs[data_def]
        out += [f"## {kind} — data ({KIND_FA[kind]})", ""]
        out += _block(data, defs, "", {data_def})
        if kind == "record":
            out += [""] + _location_lines(data, "")
        out.append("")
    out += ["## worked `new[]` entries", ""]
    for example in EXAMPLES:
        if example["kind"] in wanted:
            out += ["```json",
                    json.dumps(example, ensure_ascii=False, indent=2),
                    "```", ""]
    return "\n".join(out)


def shape_section():
    """`shape_card` over the schema on disk, for every kind a unit may write.

    ponytail: the schema is re-read once per unit (fifteen 12 KB reads a run).
    Cache it when a build ever spends measurable time here.
    """
    return shape_card(WRITABLE_KINDS, read_json(schema_dir() / "facts.schema.json"))
```

`json` is already imported at the top of `build.py`? It is **not** — add `import json`
to the stdlib import block at lines 12-18, in alphabetical order between `import hashlib`
and `import math`.

- [ ] **Step 4: Hang it off `render_input`**

In `engine/facts_plan/build.py`, replace line 1784:

```python
    out += ["", expression, "", style]
```

with

```python
    # §3.2: the contract goes after the expression card and before the style
    # card — how to write the value, then what the shape may be, then how the
    # prose beside it reads.
    out += ["", expression, "", shape_section(), "", style]
```

- [ ] **Step 5: Hang it off the review's input too**

In `engine/facts_plan/assemble.py`, change the import at line 25 from

```python
from facts_plan.build import estimate_tokens, label_of, process_index
```

to

```python
from facts_plan.build import (estimate_tokens, label_of, process_index,
                              shape_section)
```

and replace `_digest_text`'s final two lines (`engine/facts_plan/assemble.py:977-978`):

```python
    lines += [f'{d["skeleton"]} · {d["kind"]} · {d["label"]} · {d["reason_code"]}'
              for d in state["dropped"]] or ["—"]
    return "\n".join(lines) + "\n"
```

with

```python
    lines += [f'{d["skeleton"]} · {d["kind"]} · {d["label"]} · {d["reason_code"]}'
              for d in state["dropped"]] or ["—"]
    # The reviewer rewrites `title`/`statement` and may `keep` with `data`, so
    # it is held to the same closed contract the units are (§3.2).
    lines += ["", shape_section()]
    return "\n".join(lines) + "\n"
```

- [ ] **Step 6: Assert it over the mini estate**

In `engine/tests/test_facts_plan_units.py`, inside
`test_build_writes_the_four_artefacts_over_the_mini_estate`, change the per-unit assertion loop
(currently ending `assert "Expression card" in text and "Style card" in text`) to:

```python
        assert "Expression card" in text and "Style card" in text
        # §3.2: every unit is shown the closed payload contract, and it fits
        # inside the same budget the rest of the input does.
        assert "Shape card" in text and "medium=paper: holder*، kept_at*" in text
```

- [ ] **Step 7: Run the tests**

Run: `.venv/bin/pytest -q -k "shape_card or worked_examples or payload_definitions or shape_section or four_artefacts or cards"`
Expected: PASS, 9 passed (the two pre-existing card tests, the six new ones, the mini-estate build).

- [ ] **Step 8: Run everything the card touches**

Run: `.venv/bin/pytest -q -k "facts_plan or facts_acceptance"`
Expected: PASS. The card adds ~2 300 tokens to every `input.md`; the frozen-estate acceptance
(`test_facts_plan_fixture.py`, `test_facts_acceptance.py`) re-runs `plan_units`, so a unit that was
within 2 300 tokens of the 20 K bound now splits and its id gains an axis suffix. If
`test_facts_acceptance.py` fails on a missing `units/<id>/out.1.json`, that is what happened: read
the new unit ids out of `plan.json`, and STOP — a split of the frozen estate changes which
`fixtures/facts-plan/units/*.json` apply, which is a decision for the plan's author, not a rename.
Report it and do not rename the fixtures.

- [ ] **Step 8b: `--refresh-inputs` re-renders an existing run's inputs (assembler's ruling 5)**

An existing run (the acceptance run of Task 8) must receive the shape section without a rebuild, and `check_rebuild` rightly refuses `--rebuild` once units are done. Factor the per-unit rendering `build()` does at its end into `_render_units(root, department, run_dir, skeleton, units, extras) -> list[dict]` (returning `{unit, tokens, over_budget}` per unit; `build()` calls it), and add `refresh_inputs(root, run_dir) -> dict` in `build.py`: load `skeleton.json` and `plan.json`, rebuild the same extras (the reuse/process slices, the called-function bodies, the cards), rewrite every `units/<id>/input.md`, touch neither `plan.json` nor any `out.<n>.json`, never split, and print `facts-plan: <unit> input over budget (<tokens>)` per unit whose text no longer `fits`; return `{"refreshed": n, "over_budget": [ids]}`. `review/input.md` is not rewritten here — `facts-plan digest` renders it and Task 8 runs `digest` again before the review. In `cli.py`: `build.add_argument("--refresh-inputs", action="store_true")` and, in `main`, `if args.refresh_inputs: result = refresh_inputs(root, run)` before the normal `build` call (mutually exclusive with `--rebuild`; both → exit 2 with one line). Test in `engine/tests/test_facts_plan_units.py`: build the mini estate into a temp run, write a fake `units/<u>/out.1.json`, strip the shape section from one `input.md`, call `refresh_inputs` → the section is back, `plan.json` bytes identical, the `out.1.json` untouched, the return value counts the unit; and `--refresh-inputs --rebuild` together exit 2. Fold into this task's commit.

- [ ] **Step 9: Commit**

```bash
git add engine/facts_plan/build.py engine/facts_plan/assemble.py \
        engine/tests/test_facts_plan_cards.py engine/tests/test_facts_plan_units.py
git commit -m "$(cat <<'EOF'
feat(facts): the unit is shown the shape it is held to

`shape_card` renders the five closed payloads out of `facts.schema.json` —
key lists with the required keys marked, every enum, the five column types,
`location` per medium — plus three worked `new[]` entries a test validates
against the delta contract. `render_input` appends it after the expression
card and `digest` after the review's entry list.

The 2026-09-07 cooking run had 52 of 220 entries refused at Stage V on shape
alone, with nothing wrong in the content: the unit was never shown the
contract. A card typed by hand would drift from the checker inside a release,
so the card is generated and a test holds every enum value and required key
of the schema to it.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```

---

### Task 4b: unread attachments are named (addendum §3.7, invariant I2)

**Files:**
- Modify: `engine/facts_plan/build.py:239-247` (`ISSUE_TEXT`) — via a new `ISSUE_TEXT.update({…})`
  beside the new function, matching the house style at lines 696 and 997
- Modify: `engine/facts_plan/build.py:1811-1818` (below `_attachment_texts`, where the department's
  `.text/` cache is already the subject)
- Modify: `engine/facts_plan/build.py:1934` (`issues += rule_issues + …` in `build()`)
- Modify: `engine/facts_plan/assemble.py:269-287` (`ISSUE_FA`)
- Modify: `engine/facts_plan/assemble.py:1097-1145` (`gate_b`)
- Modify: `engine/facts_plan/assemble.py:1150-1242` (`report` — extract the workbook block,
  extend the heading)
- Test: `engine/tests/test_facts_plan_units.py` (append)
- Test: `engine/tests/test_facts_plan_report.py` (append)

**Interfaces:**
- Consumes: `extract_attachment.CONVERTERS` (`{".docx": ".txt", ".pdf": ".pdf.md",
  ".jpg"/".jpeg"/".png"/".webp": ".image.md"}`), `extract_attachment.PASSTHROUGH_EXTENSIONS`
  (`{".csv", ".md", ".txt", ".gs"}`), `extract_attachment.find_attachments(adir) -> list[Path]`
  (plain files directly under `adir`, never `.text/` and never a dotfile),
  `extract_attachment.needs_conversion(src, dst, digest=None) -> bool` (true when `dst` or its
  `<dst.name>.sha256` sidecar is missing, or the sidecar's digest is not `src`'s);
  `facts_plan.build._issue(kind, *, instance=None, target=None, **fields) -> dict`.
- Produces:
  - `facts_plan.build.unread_attachments(root, department) -> list[dict]` — skeleton issues,
    sorted by file name, `kind: "unread_attachment"`, `run_only: True`, `instance: None`,
    `target` the file's own name.
  - `facts_plan.build.UNREAD_NO_READER` / `UNREAD_NOT_READY: str` — the two clause halves.
  - `facts_plan.assemble.UNREAD_KIND: str` = `"unread_attachment"`.
  - `facts_plan.assemble._unread_block(root, department, issues) -> list[str]` — the
    «فایل‌هایی که در این اجرا خوانده نشدند» heading and its bullets, or `[]`; called by both
    `gate_b` and `report`.

---

- [ ] **Step 1: Write the failing tests**

Append to `engine/tests/test_facts_plan_units.py`:

```python
def _attachment(root, name, text=None, suffix=None):
    """One department attachment, and its `.text/` cache when `text` is given —
    in the exact two files `extract-attachment` writes: `.text/<stem><suffix>`
    and `.text/<stem><suffix>.sha256` holding the SOURCE file's digest."""
    import hashlib
    adir = root / "departments" / "cooking" / "attachments"
    adir.mkdir(parents=True, exist_ok=True)
    src = adir / name
    src.write_bytes(name.encode("utf-8"))
    if text is not None:
        dst = adir / ".text" / (src.stem + suffix)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(text, encoding="utf-8")
        (dst.parent / (dst.name + ".sha256")).write_text(
            hashlib.sha256(src.read_bytes()).hexdigest() + "\n", encoding="utf-8")
    return src


def test_an_attachment_with_no_converter_is_an_issue_named_by_its_file(tmp_path):
    """I2 — `extract-attachment` reads the extensions in its dispatch table and
    nothing else, and a file it cannot read is never improvised over."""
    from facts_plan.build import unread_attachments
    _attachment(tmp_path, "چیدمان-انبار.xyz")
    issues = unread_attachments(tmp_path, "cooking")
    assert [i["kind"] for i in issues] == ["unread_attachment"]
    assert issues[0]["target"] == "چیدمان-انبار.xyz"
    assert issues[0]["run_only"] is True and issues[0]["engine"] is True
    assert "چیدمان-انبار.xyz" in issues[0]["description"]
    assert "attachments" not in issues[0]["description"]     # no path, ever


def test_a_supported_attachment_with_no_cached_text_is_an_issue(tmp_path):
    from facts_plan.build import UNREAD_NOT_READY, unread_attachments
    _attachment(tmp_path, "فرم-تحویل.docx")
    issues = unread_attachments(tmp_path, "cooking")
    assert len(issues) == 1
    assert UNREAD_NOT_READY in issues[0]["description"]
    assert "فرم-تحویل.docx" in issues[0]["description"]


def test_a_read_attachment_and_a_workbook_raise_nothing(tmp_path):
    """A converted file, a passthrough one and an `.xlsx` are all accounted
    for: the first by its cache, the second because it needs none, the third by
    the manifest, which names an unplaced workbook in the same block already."""
    from facts_plan.build import unread_attachments
    _attachment(tmp_path, "فرم-تحویل.docx", text="متن فرم", suffix=".txt")
    _attachment(tmp_path, "شمارش.csv")
    _attachment(tmp_path, "گزارش.xlsx")
    assert unread_attachments(tmp_path, "cooking") == []


def test_a_stale_cached_text_is_an_issue(tmp_path):
    """The gate is `extract-attachment`'s own: a source edited after its text
    was cached has not been read in the form this run would use."""
    from facts_plan.build import unread_attachments
    src = _attachment(tmp_path, "فرم-تحویل.docx", text="متن فرم", suffix=".txt")
    src.write_bytes(b"a different document")
    assert len(unread_attachments(tmp_path, "cooking")) == 1


def test_a_department_with_no_attachments_dir_raises_nothing(tmp_path):
    from facts_plan.build import unread_attachments
    assert unread_attachments(tmp_path, "cooking") == []


def test_build_records_the_unread_files_in_the_skeleton(tmp_path):
    """End to end over the mini estate: the two unread files reach
    `skeleton.json`, and no unit's `input.md` names either of them."""
    import json as _json
    from facts_plan.build import build
    from facts_plan_helpers import estate
    estate(tmp_path)
    _attachment(tmp_path, "چیدمان-انبار.xyz")
    _attachment(tmp_path, "فرم-تحویل.docx")
    _attachment(tmp_path, "فرم-ضایعات.pdf", text="متن فرم ضایعات",
                suffix=".pdf.md")
    run_dir = tmp_path / "runs" / "facts" / "cooking" / "20260907-101500"

    build(tmp_path, "cooking", run_dir, [])

    skeleton = _json.loads((run_dir / "skeleton.json").read_text(encoding="utf-8"))
    unread = [i for i in skeleton["issues"] if i["kind"] == "unread_attachment"]
    assert sorted(i["target"] for i in unread) == ["چیدمان-انبار.xyz",
                                                   "فرم-تحویل.docx"]
    everything = "".join(p.read_text(encoding="utf-8")
                         for p in (run_dir / "units").rglob("input.md"))
    assert "چیدمان-انبار" not in everything and "فرم-تحویل" not in everything
    assert "متن فرم ضایعات" in everything          # the one that WAS read
```

Append to `engine/tests/test_facts_plan_report.py`:

```python
def _unread(name, why):
    from facts_plan.build import ISSUE_TEXT
    return {"kind": "unread_attachment", "instance": None, "target": name,
            "engine": True, "run_only": True,
            "description": ISSUE_TEXT["unread_attachment"].format(file=name,
                                                                  why=why)}


def test_gate_b_and_the_report_name_the_unread_files_under_one_heading(tmp_path):
    """§3.7 — an unplaced workbook and a file nothing could read are the same
    sentence to the owner, so they are one list under one heading, in both
    files. Neither may leak a path, an id or an extension the owner did not
    type themselves."""
    from facts_plan.build import UNREAD_NO_READER, UNREAD_NOT_READY
    from merge_facts.apply import apply
    root = _root(tmp_path); _seed_units(root)
    run_dir = _run_dir(root, "20260907-101500")
    apply(root, _write(root, "d1.json", _const_delta(5)), run_dir)
    _plan_files(run_dir)
    skeleton = json.loads((run_dir / "skeleton.json").read_text(encoding="utf-8"))
    skeleton["issues"] += [_unread("چیدمان-انبار.xyz", UNREAD_NO_READER),
                           _unread("فرم-تحویل.docx", UNREAD_NOT_READY)]
    (run_dir / "skeleton.json").write_text(json.dumps(skeleton, ensure_ascii=False),
                                           encoding="utf-8")
    entry = next(e for e in load_store(root)["rule"]["entries"] if e["key"] == "tol")

    gate = gate_b(root, skeleton, [entry],
                  {"department": "cooking", "dropped": [], "undecided": []})
    text = report(root, run_dir).read_text(encoding="utf-8")

    for produced in (gate, text):
        assert "فایل‌هایی که در این اجرا خوانده نشدند (۲ مورد)" in produced
        assert "«چیدمان-انبار.xyz»" in produced and UNREAD_NO_READER in produced
        assert "«فرم-تحویل.docx»" in produced and UNREAD_NOT_READY in produced
        # not a second time, under the file-problems heading
        assert produced.count("چیدمان-انبار.xyz") == 1
        for line in produced.splitlines():
            assert not re.search(r"__s|S-|N-|u-|/", line), line


def test_neither_file_grows_the_heading_when_everything_was_read(tmp_path):
    run_dir = _run(tmp_path)
    _store(tmp_path, [])
    text = report(tmp_path, run_dir).read_text(encoding="utf-8")
    skeleton = json.loads((run_dir / "skeleton.json").read_text(encoding="utf-8"))
    gate = gate_b(tmp_path, skeleton, [],
                  {"department": "cooking", "dropped": [], "undecided": []})
    assert "خوانده نشدند" not in text and "خوانده نشدند" not in gate
```

and add `import re` to that module's imports (it currently imports only `json`).

- [ ] **Step 2: Run them to verify they fail**

Run: `.venv/bin/pytest -q -k "unread or unread_files or no_converter or cached_text"`
Expected: FAIL — `ImportError: cannot import name 'unread_attachments' from 'facts_plan.build'`.

- [ ] **Step 3: Add the lister to `engine/facts_plan/build.py`**

Insert immediately after `_attachment_texts` (after line 1818):

```python
#: §3.7's two halves of one sentence. One issue kind, two reasons: the owner is
#: told the file was not read and why, in words that name no path, no dispatch
#: table and no extension they did not type themselves.
UNREAD_NO_READER = "سامانه فایل‌هایی از این نوع را نمی‌خواند"
UNREAD_NOT_READY = "متن این فایل هنوز آماده نشده بود"

ISSUE_TEXT.update({
    "unread_attachment": "فایل «{file}» در این اجرا خوانده نشد؛ {why}.",
})


def unread_attachments(root, department):
    """Invariant I2 — every department attachment this run will not read, as an
    issue, sorted by file name.

    `extract-attachment` reads the extensions in its dispatch table and nothing
    else, and the 2026-09-02 run improvised over the rest. A file outside the
    table, or one inside it whose cached text is missing or stale, is named to
    the owner once and left out of every unit — `_attachment_texts` globs the
    `.text/` cache, so an unread file is already invisible to a unit; this is
    what makes it visible to the owner.

    `.csv`/`.md`/`.txt`/`.gs` need no conversion and `.xlsx` belongs to
    `dump-workbook`, whose unplaced rows are named under the very same heading
    (§2.1 Stage 2) — naming an `.xlsx` here would be the same file twice.
    """
    from extract_attachment import (CONVERTERS, PASSTHROUGH_EXTENSIONS,
                                    find_attachments, needs_conversion)
    adir = pathlib.Path(root) / "departments" / department / "attachments"
    out = []
    for src in find_attachments(adir):
        ext = src.suffix.lower()
        if ext in PASSTHROUGH_EXTENSIONS or ext == ".xlsx":
            continue
        suffix = CONVERTERS.get(ext)
        if suffix is None:
            why = UNREAD_NO_READER
        elif needs_conversion(src, adir / ".text" / (src.stem + suffix)):
            why = UNREAD_NOT_READY
        else:
            continue
        # `target` is the file's own name, never a path: it is what `gate-b.md`
        # and `report.md` print, and §2.7 admits no path in either.
        out.append(_issue("unread_attachment", target=src.name,
                          file=src.name, why=why))
    return out
```

`find_attachments` already sorts, so `out` is sorted.

- [ ] **Step 4: Raise them in `build()`**

In `engine/facts_plan/build.py`, replace line 1934:

```python
    issues += rule_issues + import_issues + reference_tab_issues(estate, department)
```

with

```python
    issues += (rule_issues + import_issues
               + reference_tab_issues(estate, department)
               + unread_attachments(root, department))
```

- [ ] **Step 5: Give the kind the owner's word**

In `engine/facts_plan/assemble.py`, add one row to `ISSUE_FA` (after line 286,
`"reference_tab_computes"`, keeping the closing brace):

```python
            "reference_tab_computes": "تب مرجع فرمول دارد",
            "unread_attachment": "فایلی که خوانده نشد"}
```

- [ ] **Step 6: One heading, one function, two files**

In `engine/facts_plan/assemble.py`, add above `gate_b` (before line 1097):

```python
#: §3.7. `report` groups every other issue kind under «ایرادهای یافته‌شده در
#: فایل‌ها»; this one is not a problem inside a file, it is a file nobody read,
#: and it belongs beside the workbook the owner has not placed.
UNREAD_KIND = "unread_attachment"


def _skipped_workbooks(root, department):
    """§2.1's Stage 2 row: `dump-workbook --manifest` skips a row the owner has
    not placed, and this is where that workbook is named — by its file title and
    branch, the way `build._where` names a tab, never by an id or a path."""
    manifest = read_json(pathlib.Path(root) / "attachments" / "sheets" /
                         "manifest.json")
    branch_fa = {b["code"]: b["name"] for b in manifest.get("branches") or []}
    out = []
    for row in manifest["workbooks"]:
        departments = row.get("departments") or []
        # An unplaced row belongs to no department, so no run would ever name it
        # if this asked for a match alone.
        if not row.get("unresolved") or (departments
                                         and department not in departments):
            continue
        where = "، ".join(branch_fa.get(b, b) for b in row.get("branches") or [])
        out.append(f'  • «{pathlib.Path(row.get("file") or "").stem}»'
                   + (f" ({where})" if where else "") + ": "
                   + " و ".join(UNRESOLVED_FA.get(c, c) for c in row["unresolved"])
                   + " مشخص نشده است.")
    return out


def _unread_block(root, department, issues):
    """The one list both owner-facing files print: the workbooks the owner has
    not placed, and the attachments nothing could read (§3.7). One heading, one
    implementation — `gate-b.md` and `report.md` cannot disagree about what was
    left out of a run."""
    rows = _skipped_workbooks(root, department) + [
        f'  • {i["description"]}' for i in issues if i["kind"] == UNREAD_KIND]
    if not rows:
        return []
    return [f"فایل‌هایی که در این اجرا خوانده نشدند ({_fa(len(rows))}"
            " مورد) — پس از تعیین تکلیف، در اجرای بعدی خوانده می‌شوند:"] \
        + rows + [""]
```

- [ ] **Step 7: Print it from `gate_b`**

In `gate_b`, replace the `issues` line (`engine/facts_plan/assemble.py:1108`):

```python
    issues = [i for i in skeleton["issues"]]
```

with

```python
    # An unread file is not an issue found *in* a file — it has its own block
    # below, and counting it here would name it twice.
    issues = [i for i in skeleton["issues"] if i["kind"] != UNREAD_KIND]
```

and replace `gate_b`'s closing two lines (`engine/facts_plan/assemble.py:1143-1145`):

```python
    out += [f"بی‌پاسخ: {_fa(unknown)} خانه — در پنل.", "", "تأیید می‌کنید؟", ""]
    return "\n".join(out)
```

with

```python
    out += _unread_block(root, state["department"], skeleton["issues"])
    out += [f"بی‌پاسخ: {_fa(unknown)} خانه — در پنل.", "", "تأیید می‌کنید؟", ""]
    return "\n".join(out)
```

- [ ] **Step 8: Print it from `report`, off the same function**

In `report`, delete the inline workbook block — `engine/facts_plan/assemble.py:1174-1191`, from the
comment `# §2.1's Stage 2 row:` through the `skipped.append(...)` statement — and its
`manifest`/`branch_fa`/`skipped` locals. Then change the issue grouping
(`engine/facts_plan/assemble.py:1226-1233`) from

```python
    if skeleton["issues"]:
        out.append("ایرادهای یافته‌شده در فایل‌ها:")
        grouped = {}
        for issue in skeleton["issues"]:
            grouped.setdefault(issue["kind"], []).append(issue["description"])
```

to

```python
    found = [i for i in skeleton["issues"] if i["kind"] != UNREAD_KIND]
    if found:
        out.append("ایرادهای یافته‌شده در فایل‌ها:")
        grouped = {}
        for issue in found:
            grouped.setdefault(issue["kind"], []).append(issue["description"])
```

and replace the heading block (`engine/facts_plan/assemble.py:1231-1234`):

```python
    if skipped:
        out.append(f"فایل‌هایی که در این اجرا خوانده نشدند ({_fa(len(skipped))}"
                   " مورد) — پس از تعیین تکلیف، در اجرای بعدی خوانده می‌شوند:")
        out += skipped + [""]
```

with

```python
    out += _unread_block(root, skeleton["department"], skeleton["issues"])
```

- [ ] **Step 9: Run the tests**

Run: `.venv/bin/pytest -q -k "unread or no_converter or cached_text or heading or facts_plan_report"`
Expected: PASS. `test_every_issue_kind_has_the_owner_s_words` (the `set(ISSUE_FA) == set(ISSUE_TEXT)`
parity check) passes because Step 3 and Step 5 add the same key to both tables.

- [ ] **Step 10: Run the acceptance chain**

Run: `.venv/bin/pytest -q -k "facts_plan or facts_acceptance"`
Expected: PASS, including
`test_a_workbook_the_owner_has_not_placed_is_named_once` — the heading it asserts is now printed by
`_unread_block` and its text is byte-identical.

- [ ] **Step 11: Commit**

```bash
git add engine/facts_plan/build.py engine/facts_plan/assemble.py \
        engine/tests/test_facts_plan_units.py engine/tests/test_facts_plan_report.py
git commit -m "$(cat <<'EOF'
feat(facts): a file nothing could read is named, once, in the owner's words

`unread_attachments` compares the department's attachments with
`extract-attachment`'s dispatch table and its `.text/` cache: an extension with
no converter, or a supported file whose cached text is missing or stale,
becomes an `unread_attachment` issue carrying the file's own name and nothing
else. `gate_b` and `report` print it beside the workbooks the owner has not
placed, under the one heading they now share.

Invariant I2: the intake is explicit. A file the engine cannot read is never
improvised over — the run continues without it and the owner is told which one
it was.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```

---

### Task 4c: the evidence-type fixture and the I1 test (addendum §3.8)

**Files:**
- Modify: `engine/tests/fixtures/facts_plan/make_dump.py:214-248` (`make_estate`, and the module
  docstring at lines 1-19)
- Create: `engine/tests/test_facts_evidence_types.py`
- Test: the same file

**Interfaces:**
- Consumes: `facts_plan.build.build(root, department, run_dir, recordings, *, rebuild=False)`;
  `facts_plan.assemble.validate_unit(root, run_dir, path) -> list[str]` (empty when the document may
  pass — **with Task 3 landed it materialises each `new[]` entry and validates it against
  `facts-delta.schema.json` and the content pass**);
  `facts_plan.assemble.assemble(root, run_dir, *, review=False) -> dict`;
  `merge_facts.apply.simulate(root, delta_path, run_dir) -> (store, problems)`;
  `facts_helpers._units_delta()`, `_write`, `_run_dir`, `_seed_units`;
  `facts_plan_helpers.estate(root)`.
- Produces:
  - `fixtures.facts_plan.make_dump.ATTACHMENTS: tuple` — `(file name, cached suffix, cached text)`
    per attachment; `None` as the suffix means the file has no cache and never gets one.
  - `fixtures.facts_plan.make_dump.TRANSCRIPT: str` — the four lines describing the fourth form.
  - `fixtures.facts_plan.make_dump.make_attachments(root, department=DEPARTMENT) -> pathlib.Path`
    — writes the attachment set and returns the `attachments/` directory.
  - `fixtures.facts_plan.make_dump.make_estate(root, *, attachments=False)` — the existing
    signature plus one keyword; **default `False`, so the twelve existing callers are unchanged.**

---

- [ ] **Step 1: Grow the fixture**

In `engine/tests/fixtures/facts_plan/make_dump.py`, append to the module docstring (before its
closing `"""` at line 19):

```
Two things beside the workbooks, written only when `make_estate(root,
attachments=True)` asks for them (§3.8): a department attachment set with the
`.text/` sidecars `extract-attachment` writes — `<stem>.txt` for a `.docx`,
`<stem>.pdf.md`, `<stem>.image.md`, each with its `<name>.sha256` holding the
SOURCE file's digest — describing three paper forms; and one file
(`.xyz`) nothing can read. A fourth form exists only in `TRANSCRIPT`.
```

Add after the `VALIDATIONS` block (after line 199, before `def _tsv`):

```python
# The department's attachments, in the four states §3.8 needs: a `.docx` whose
# text was cached, a `.pdf` and an image likewise, and one file with no
# converter. `(name, cached suffix, cached text)`; a `None` suffix is a file
# `extract-attachment` writes nothing for.
ATTACHMENTS = (
    ("فرم-تحویل-انبار.docx", ".txt",
     "فرم تحویل کالا از انبار\n"
     "ستون‌ها: تاریخ | نام کالا | مقدار (کیلوگرم) | تحویل‌گیرنده\n"
     "نسخهٔ سفید در دفتر انبار نگهداری می‌شود و سرپرست انبار مسئول آن است.\n"
     "پای فرم را انباردار و سرپرست آشپزخانه امضا می‌کنند.\n"),
    ("فرم-ضایعات.pdf", ".pdf.md",
     "# فرم ثبت ضایعات روزانه\n\n"
     "ستون‌ها: تاریخ | نام کالا | مقدار دورریز (کیلوگرم) | علت\n"
     "فرم‌های پرشده در کلاسور آشپزخانه نگهداری می‌شود و سرآشپز مسئول آن است.\n"),
    ("فرم-شمارش-یخچال.png", ".image.md",
     "# فرم شمارش یخچال\n\n"
     "عکس یک فرم کاغذی با ستون‌های: نام کالا | تعداد | امضای شمارنده\n"
     "فرم‌ها روی در یخچال نصب می‌شوند و مسئول شیفت آن‌ها را نگه می‌دارد.\n"),
    ("چیدمان-انبار.xyz", None, None),
)

# The fourth form: nobody photographed it, and it exists only in what was said.
TRANSCRIPT = (
    "سرپرست انبار: یک فرم کاغذی هم داریم برای مرجوعی کالا به تأمین‌کننده.\n"
    "سرپرست انبار: ستون‌هایش تاریخ، نام کالا، مقدار برگشتی و علت مرجوعی است.\n"
    "سرپرست انبار: فرم‌های پرشده در زونکن دفتر انبار می‌ماند و خودم نگه می‌دارم.\n"
    "مدیر: پای همان فرم را هم انباردار امضا می‌کند.\n"
)


def make_attachments(root, department=DEPARTMENT):
    """The department's attachments and the `.text/` cache `extract-attachment`
    would have written for them — `<stem><suffix>` beside `<stem><suffix>.sha256`
    holding the sha256 of the SOURCE file, which is the gate `needs_conversion`
    reads."""
    adir = pathlib.Path(root) / "departments" / department / "attachments"
    adir.mkdir(parents=True, exist_ok=True)
    for name, suffix, text in ATTACHMENTS:
        src = adir / name
        src.write_bytes(name.encode("utf-8"))
        if suffix is None:
            continue
        dst = adir / ".text" / (src.stem + suffix)
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(text, encoding="utf-8")
        (dst.parent / (dst.name + ".sha256")).write_text(
            hashlib.sha256(src.read_bytes()).hexdigest() + "\n", encoding="utf-8")
    return adir
```

Add `import hashlib` to the module's import block (line 20-22: between `import json` and
`import pathlib` — alphabetical, so `hashlib` goes first).

Change `make_estate`'s signature and tail (`engine/tests/fixtures/facts_plan/make_dump.py:214`
and its `return sheets_root`):

```python
def make_estate(root, *, attachments=False):
    """Write the mini estate under `root/attachments/sheets/`.

    `attachments=True` also writes the department's attachment set (§3.8). It is
    off by default because every existing caller asserts over a run with no
    attachment, and an attachment appended to the last transcript unit changes
    that unit's `inputs` and the plan's hashes.
    """
```

and, just above `return sheets_root`:

```python
    if attachments:
        make_attachments(root)
    return sheets_root
```

- [ ] **Step 2: Write the failing test**

Create `engine/tests/test_facts_evidence_types.py`:

```python
"""§3.8 — one paper form per kind of evidence, through the gate that closed.

The 2026-09-07 run wrote two photographed paper forms as records with invented
keys (`blank_master`, `header_fields`, `signatures`, `sections`) and no
`location`, and Stage V refused them after both the unit and the reviewer had
spent their attempts. Invariant I1 says that refusal belongs at the unit's
gate: whatever a unit writes, from whatever evidence — a `.docx`, a `.pdf`, an
image, or a form only ever spoken about — is held to the same per-entry
contract `merge facts apply` enforces.

So: four forms, four kinds of evidence, one shape. Each one through
`validate facts-unit` (must pass), each one deliberately broken (must fail at
that gate, naming the field), and all four through `assemble` and `simulate`
(must not be refused).
"""
import copy
import json

import pytest
from facts_plan.assemble import assemble, validate_unit
from facts_plan.build import build
from facts_helpers import _run_dir, _seed_units, _units_delta, _write
from facts_plan_helpers import estate
from merge_facts.apply import simulate

#: The four forms, in the evidence each arrived on: a `.docx`, a `.pdf`, an
#: image, and a transcript line. Every one is a paper record with the closed
#: `location` of §3.3.
FORMS = [
    ("form_tahvil_anbar", "فرم تحویل کالا از انبار",
     "فرم کاغذی که هنگام تحویل هر قلم از انبار به لاین پر می‌شود و مقدار "
     "تحویلی و تحویل‌گیرنده را ثبت می‌کند.",
     {"kept_at": "دفتر انبار", "holder": "سرپرست انبار"},
     [{"key": "tarikh", "title": "تاریخ", "type": "date"},
      {"key": "qalam", "title": "نام کالا", "type": "string"},
      {"key": "meqdar", "title": "مقدار", "type": "number", "unit": "kg"},
      {"key": "tahvil_girande", "title": "تحویل‌گیرنده", "type": "string"}]),
    ("form_zayeat", "فرم ثبت ضایعات روزانه",
     "فرم کاغذی که مقدار دورریز هر قلم و علت آن را در پایان هر روز ثبت می‌کند.",
     {"kept_at": "کلاسور آشپزخانه", "holder": "سرآشپز"},
     [{"key": "tarikh", "title": "تاریخ", "type": "date"},
      {"key": "qalam", "title": "نام کالا", "type": "string"},
      {"key": "meqdar_dorriz", "title": "مقدار دورریز", "type": "number",
       "unit": "kg"},
      {"key": "elat", "title": "علت", "type": "string"}]),
    ("form_shomaresh_yakhchal", "فرم شمارش یخچال",
     "فرم کاغذی که تعداد هر قلم داخل یخچال را در هر شیفت ثبت می‌کند.",
     {"kept_at": "در یخچال", "holder": "مسئول شیفت"},
     [{"key": "qalam", "title": "نام کالا", "type": "string"},
      {"key": "tedad", "title": "تعداد", "type": "number", "unit": "pcs"}]),
    ("form_marjui", "فرم مرجوعی کالا به تأمین‌کننده",
     "فرم کاغذی که مقدار برگشتی هر قلم به تأمین‌کننده و علت مرجوعی را ثبت می‌کند.",
     {"kept_at": "زونکن دفتر انبار", "holder": "سرپرست انبار"},
     [{"key": "tarikh", "title": "تاریخ", "type": "date"},
      {"key": "qalam", "title": "نام کالا", "type": "string"},
      {"key": "meqdar_bargashti", "title": "مقدار برگشتی", "type": "number",
       "unit": "kg"},
      {"key": "elat_marjui", "title": "علت مرجوعی", "type": "string"}]),
]


def _record(form):
    key, title, statement, location, fields = form
    return {"kind": "record", "key": key, "title": title,
            "statement": statement,
            "data": {"medium": "paper", "role": "log", "location": location,
                     "cadence": "daily", "fields": copy.deepcopy(fields),
                     "filled_by": "انباردار"}}


def _run(tmp_path):
    """The mini estate with its attachment set and the transcript that names
    the fourth form, built, seeded, and ready for a unit's output."""
    from fixtures.facts_plan.make_dump import TRANSCRIPT, make_attachments
    root = tmp_path / "data"
    root.mkdir()
    estate(root)
    make_attachments(root)
    transcripts = root / "meetings" / "transcripts"
    transcripts.mkdir(parents=True)
    (transcripts / "cooking-1405-05-26.txt").write_text(TRANSCRIPT,
                                                        encoding="utf-8")
    (root / "departments" / "cooking" / "processes").mkdir(parents=True,
                                                           exist_ok=True)
    (root / "departments" / "registry.json").write_text(json.dumps(
        {"departments": [{"code": "cooking", "name": "آشپزخانه"}]},
        ensure_ascii=False), encoding="utf-8")
    (root / "facts").mkdir()
    _seed_units(root)                        # the `units` record `kg`/`pcs` need
    run = root / "runs" / "facts" / "cooking" / "20260907-101500"
    run.mkdir(parents=True)
    build(root, "cooking", run, ["cooking-1405-05-26"])
    plan = json.loads((run / "plan.json").read_text(encoding="utf-8"))
    unit = next(u for u in plan["units"] if u["type"] == "transcript")
    return root, run, unit["id"]


def _out(run, unit_id, entries, attempt=1):
    path = run / "units" / unit_id / f"out.{attempt}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(
        {"schema_version": 1, "unit": unit_id, "attempt": attempt,
         "decisions": [], "new": entries}, ensure_ascii=False), encoding="utf-8")
    return path


def test_the_transcript_unit_is_shown_the_shape_section(tmp_path):
    """The unit that writes a paper form from what was said is a transcript
    unit, and §3.2 says it carries the contract."""
    root, run, unit_id = _run(tmp_path)
    text = (run / "units" / unit_id / "input.md").read_text(encoding="utf-8")
    assert "Shape card" in text
    assert "medium=paper: holder*، kept_at*" in text
    assert "* medium: one of sheet | paper | external | native" in text
    # the evidence itself, three sidecars deep
    assert "فرم تحویل کالا از انبار" in text
    assert "فرم ثبت ضایعات روزانه" in text
    assert "عکس یک فرم کاغذی" in text
    assert "فرم کاغذی هم داریم برای مرجوعی" in text
    assert "چیدمان-انبار" not in text            # the one nothing could read


@pytest.mark.parametrize("form", FORMS, ids=[f[0] for f in FORMS])
def test_each_paper_form_passes_the_unit_gate(tmp_path, form):
    """I1 — the shape is one shape, whatever the evidence was."""
    root, run, unit_id = _run(tmp_path)
    assert validate_unit(root, run, _out(run, unit_id, [_record(form)])) == []


@pytest.mark.parametrize("form", FORMS, ids=[f[0] for f in FORMS])
@pytest.mark.parametrize("break_it,names", [
    ("type", "type"), ("signatures", "signatures"), ("location", "location")],
    ids=["a text column", "an invented key", "an empty location"])
def test_a_wrong_shape_is_refused_at_the_unit_gate_by_field(tmp_path, form,
                                                            break_it, names):
    """The three shapes the 2026-09-07 run actually wrote. Each must be refused
    HERE — at the unit's own gate, within its two attempts — and the message
    must name the field, not dump the entry (§3.4)."""
    root, run, unit_id = _run(tmp_path)
    entry = _record(form)
    if break_it == "type":
        entry["data"]["fields"][0]["type"] = "text"
    elif break_it == "signatures":
        entry["data"]["signatures"] = [{"role": "انباردار", "sections": []}]
    else:
        entry["data"]["location"] = {}
    problems = validate_unit(root, run, _out(run, unit_id, [entry]))
    assert problems, f"{break_it} passed the gate"
    joined = "\n".join(problems)
    assert names in joined, joined
    assert len(joined) < 2000, "the gate dumped the entry instead of the field"


def test_the_four_forms_survive_assemble_and_simulate(tmp_path):
    """The whole of I1: what passes the unit's gate is what `apply` accepts. A
    per-entry refusal after this point is the defect §2 names."""
    root, run, unit_id = _run(tmp_path)
    _out(run, unit_id, [_record(f) for f in FORMS])

    assemble(root, run)

    delta = json.loads((run / "facts-delta.json").read_text(encoding="utf-8"))
    records = [e for e in delta["entries"] if e["kind"] == "record"
               and e["data"]["medium"] == "paper"]
    assert sorted(e["key"] for e in records) == sorted(f[0] for f in FORMS)
    assert all(set(e["data"]["location"]) == {"kept_at", "holder"}
               for e in records)
    _store_after, problems = simulate(root, run / "facts-delta.json",
                                      _run_dir(root, "20260907-110000"))
    assert problems == []
```

- [ ] **Step 3: Run it to verify it fails**

Run: `.venv/bin/pytest -q -k "evidence_types or paper_form or wrong_shape or four_forms"`
Expected: FAIL — `ImportError: cannot import name 'make_attachments' from
'fixtures.facts_plan.make_dump'` on every test in the module.

- [ ] **Step 4: Confirm the fixture alone, then the whole module**

The fixture change of Step 1 is the only implementation this task needs — 4a and 4b's code and
Task 3's materialisation are what make the assertions true. Run the fixture's own users first:

Run: `.venv/bin/pytest -q -k "facts_plan_units or facts_plan_edges or facts_plan_fixture"`
Expected: PASS — `make_estate`'s new keyword defaults to `False`, so nothing that called it before
sees an attachment.

Run: `.venv/bin/pytest -q -k "evidence_types or paper_form or wrong_shape or four_forms"`
Expected: PASS, 18 passed (1 shape-section + 4 gate + 12 wrong-shape + 1 assemble/simulate).

If `test_a_wrong_shape_is_refused_at_the_unit_gate_by_field` fails with `problems == []`, Task 3's
materialisation is not in place or does not reach `new[]` entries — stop and report that, do not
weaken the assertion. If `test_the_four_forms_survive_assemble_and_simulate` fails inside
`simulate` on a `source ref … names no file in this repo`, read what `_unit_sources` cited: a
transcript unit's inputs include the `.text/` sidecars this fixture writes, and those files exist,
so a failure there means the fixture's paths and the plan's disagree.

- [ ] **Step 5: Run the full suite**

Run: `.venv/bin/pytest -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add engine/tests/fixtures/facts_plan/make_dump.py \
        engine/tests/test_facts_evidence_types.py
git commit -m "$(cat <<'EOF'
test(facts): one paper form per kind of evidence, through the closed gate

The mini estate gains a department attachment set with the `.text/` sidecars
`extract-attachment` writes — `<stem>.txt`, `<stem>.pdf.md`, `<stem>.image.md`
and their `.sha256` gates — describing three paper forms, a transcript naming a
fourth, and the one file nothing can read. Four forms, four kinds of evidence,
one shape: each through `validate facts-unit`, each deliberately broken in the
three ways the 2026-09-07 run broke them, and all four through `assemble` and
`simulate`.

Invariant I1 as a test: whatever a unit writes, from whatever evidence, is
refused at its own gate or not at all. `make_estate` takes the attachment set
on a keyword so the twelve existing callers are unchanged.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```

---

#### Drafting notes (kept for the executor)

**Names invented here** (none of them appear in the addendum; later tasks and the runbook should use
these spellings): `KIND_DATA`, `KIND_FA`, `WRITABLE_KINDS`, `TERSE`, `EXAMPLES`, `shape_section()`,
`_def_name`, `_deref`, `_atom`, `_block`, `_location_lines` (4a); `UNREAD_NO_READER`,
`UNREAD_NOT_READY`, `unread_attachments()`, `UNREAD_KIND`, `_skipped_workbooks()`, `_unread_block()`
(4b); `ATTACHMENTS`, `TRANSCRIPT`, `make_attachments()`, the `attachments=` keyword, `FORMS`,
`test_facts_evidence_types.py` (4c). The addendum's `shape_card(kinds)` gains the `schema` argument
the brief specifies; `shape_section()` is the zero-argument caller that reads the schema off
`schema_dir()`.

**Where the addendum and the code disagree.**

1. **§3.7 says «the existing heading» in `gate_b`. There is no such heading in `gate_b`** — the
   «فایل‌هایی که در این اجرا خوانده نشدند» block lives only in `report`
   (`assemble.py:1231-1234`). 4b therefore *adds* the block to `gate_b`, which is a new
   owner-facing line at Gate B: the owner will now be told at approval time, not only in the final
   report, which files were left out. That reads like the intent, but it is a change to the Gate B
   message contract and the owner has not seen it. Flag to the owner before merge.
2. **`shape_card(kinds)` cannot usefully be narrowed per unit.** §3.2 says «one section per kind the
   unit may write» and the brief guesses «a workbook unit: record+rule+item(+note, measurement)».
   Reading v3.3 §2.5: the `new[]` row restricts no unit to a kind, and the frozen
   `fixtures/facts-plan/units/u-wb-fried.json` mints two `place` **items** from a **workbook** unit.
   So every unit may write all five, `render_input` passes `WRITABLE_KINDS`, and `kinds` survives
   only as a testing seam. If a later task wants per-unit trimming it needs a spec ruling on which
   kinds a unit may *not* write, not a code change.
3. **§4's «an attachment-derived entry cites `type: attachment`» contradicts itself in the same
   sentence** — it also says the `source.type` set is unchanged, and the enum
   (`facts.schema.json` `$defs.source`) has no `attachment` member. Today `_unit_sources`
   (`assemble.py:556-570`) cites `{"type": "voice"}` for every `.txt`/`.md` input a unit carries,
   which means the four paper forms of 4c land in the store cited as **voice** even when they came
   off a `.docx` or an image. 4c's tests pass either way; a Task 5–7 needs to rule: add
   `attachment` to the enum, or map the sidecar's suffix onto the existing `docx`/`pdf`/`photo`
   members. The second is the smaller change and the enum already carries all three.
4. **§3.7 does not say what to do with `.xlsx`.** 4b skips it: `dump-workbook` owns the sheets
   estate, and an unplaced workbook is already named under the very same heading by
   `_skipped_workbooks`. Naming it in both places would print one file twice. Passthrough
   extensions (`.csv`, `.md`, `.txt`, `.gs`) are skipped for the opposite reason — they are read
   directly and never cached.
5. **§3.2 says «the closed key list with the required keys marked»; the card prints the whole
   payload**, engine-written keys included (`instances`, `location.spreadsheetId`, `fields[].columns`).
   §2.5's per-kind table says which of those a unit may write and which the engine already wrote.
   The card does not mark that split. It is one more column on every line if a run shows units
   writing engine-owned keys; today nothing suggests they do, so it is left out.

**Token cost of the card** (measured against the current `schemas/facts.schema.json`, with Task 2's
`location` branches simulated, `estimate_tokens` as the measure):

| what | tokens | lines | longest line |
|---|---|---|---|
| all five kinds, no examples | 1 444 | 207 | 80 |
| all five kinds + the three examples (what ships) | **2 315** | 330 | 126 |
| `record` alone | 826 | — | — |
| `rule` alone | 416 | — | — |
| `item` / `measurement` / `note` alone | 228 / 150 / 93 | — | — |

That is a standing 2 315-token charge on every `units/*/input.md` and on `review/input.md`, against
a 20 000-token input budget and a 50 000-token digest ceiling — 11.6 % and 4.6 %. `fits` counts it
already, so a unit within 2 315 tokens of the bound now splits along its axis and its id gains a
suffix. **The frozen cooking fixture is the risk**: `test_facts_acceptance.py` writes
`fixtures/facts-plan/units/<unit id>.json` into `units/<unit id>/`, so a split renames the unit the
fixture is keyed to and the acceptance run silently decides nothing. 4a Step 8 names this
explicitly and stops rather than renaming fixtures. Check it first when reviewing 4a.

**What Tasks 5–7 should consume.**

- **The playbook / prompt (§3.2's last sentence):** the unit's dispatch prompt must gain «the shape
  section is the contract; a key not in it is refused». The card itself says so in its own header,
  but the dispatch text is where the agent is told to obey it. `control-bot/testing/
  quantify_unit_eval.py` should gain a case that writes an invented key and expects a refusal.
- **`docs/runbooks/07-facts.md`:** the owner-facing message contract for Gate B gains the
  «فایل‌هایی که در این اجرا خوانده نشدند» block (disagreement 1 above), and the pre-run checklist
  should say that `extract-attachment` runs **before** `facts-plan build` — otherwise every
  supported attachment is reported as `UNREAD_NOT_READY` and the owner is handed a list of files
  that were merely not converted yet. This is the sharpest operational edge in 4b.
- **The UI (§3.3's last line):** `ui/src/facts/cards/RecordCard` renders `kept_at`/`holder` in the
  «نسخه‌ها» band when a record has no instances. 4c's four forms are exactly the fixture that band
  needs; the delta they produce (`run/facts-delta.json` in
  `test_the_four_forms_survive_assemble_and_simulate`) is a ready seed for a UI test.
- **§3.9's headless acceptance:** `unread_attachments` runs over the real cooking department at
  build time, so the re-run of `runs/facts/cooking/20260907-052345` will surface whatever that
  department's `attachments/` actually holds. Someone should list it before the run
  (`ls departments/cooking/attachments`) so the owner's report is not the first place anyone learns
  there are six unreadable files.
- **`merge_facts.audit`:** nothing here touches it, but an `unread_attachment` is `run_only`, so it
  is never attached to an entry and never reaches the store — it exists only in `skeleton.json` and
  the two rendered files. A later task wanting «which files has this store never read» needs a
  different mechanism.

---

### Task 5: The runtime: guard, playbook, agent

**Addendum:** §3.5 (mechanical caps), §3.6 (the guard), §3.2 (the prompt sentence).

The v3 run's coordinator ran engine internals from Python to dry-run the fold, re-dispatched a
unit past the cap, and asked the owner to lift it (postmortem causes D and H). §3.5 makes both
caps the engine's; §3.6 makes the import route unavailable. This task is the prose and the hook
that say so.

#### Files

| file | anchor | change |
|---|---|---|
| `<data-repo>/.claude/hooks/guard.py` | after `ORDER_CURATE_RE` (:52) | three module-level regexes |
| `<data-repo>/.claude/hooks/guard.py` | in `main()`, after the `ORDER_CURATE_RE` deny (:104–108) | the new deny |
| `<data-repo>/.claude/hooks/guard.py` | module docblock, rule list (:5–19) | a fifth numbered rule |
| `<data-repo>/.claude/hooks/test_guard.py` | end of file (after :245) | 7 tests |
| `<data-repo>/.claude/hooks/test_playbook_lint.py` | end of file (after :224) | 1 test + `STAGE_U` |
| `<data-repo>/.claude/skills/quantify/SKILL.md` | :24–27, :222, :274–278, :285–296, :329–338, :472 | 6 prose edits |
| `<data-repo>/.claude/agents/quantify.md` | :56–57 (after "The unit contract" intro) | 1 paragraph |

#### Interfaces

`guard.py` gains no function. Three module constants and one branch inside the existing
`tool == "Bash"` arm:

```python
PYTHON_CMD_RE  : re.Pattern   # a python invocation as a command word
ENGINE_MODULE_RE : re.Pattern # facts_plan | merge_facts | engine_common
RUNS_SCRIPT_RE : re.Pattern   # a .py file under runs/
```

Blocked iff `PYTHON_CMD_RE` matches **and** (`ENGINE_MODULE_RE` matches **or**
`RUNS_SCRIPT_RE` matches). One message, exit 2.

`test_playbook_lint.py` gains one module constant `STAGE_U` and one test; `blocks`/`problems`
are untouched — the addendum's Stage U wording is a fixed sentence, not a per-block rule, so it
is checked directly rather than by growing the `bash` kind.

#### Steps
#### Step 5.1 — the guard's tests, first (they fail).

** Append to
`<data-repo>/.claude/hooks/test_guard.py`:

```python
# --- the engine is a set of CLIs, not a library (addendum §3.6) --------------
# The v3 run's coordinator dry-ran the fold from `python3 -c` and re-derived
# `assemble`'s output in-process — postmortem cause D. The CLIs stay open; the
# import route closes.

def test_block_python_c_importing_facts_plan(tmp_path):
    cmd = ("python3 -c \"import facts_plan.assemble as a;"
           "print(a.materialise('.', 'runs/facts/cooking/x', {}))\"")
    assert run(bash(cmd), tmp_path) == 2


def test_block_python_m_facts_plan(tmp_path):
    assert run(bash("python -m facts_plan.assemble --run runs/facts/cooking/x"), tmp_path) == 2


def test_block_python_heredoc_importing_merge_facts(tmp_path):
    cmd = ("python3 - <<'PY'\n"
           "from merge_facts.content import check_document\n"
           "print(check_document({}, 'facts-delta', {}, []))\n"
           "PY")
    assert run(bash(cmd), tmp_path) == 2


def test_block_uv_run_python_importing_engine_common(tmp_path):
    assert run(bash("uv run python -c 'import engine_common; print(engine_common.validate)'"),
               tmp_path) == 2


def test_block_python_script_under_runs(tmp_path):
    # The same trick behind a file name: the script is written into the run
    # directory (which the agent may write) and then executed.
    assert run(bash("python3 runs/facts/cooking/20260907-052345/dryrun.py"), tmp_path) == 2


def test_allow_python_without_an_engine_import(tmp_path):
    cmd = ("python3 -c \"import json;"
           "d=json.load(open('runs/facts/cooking/x/facts-delta.json'));"
           "print(len(d['entries']))\"")
    assert run(bash(cmd), tmp_path) == 0


def test_allow_the_engine_clis(tmp_path):
    for cli in ("facts-plan status --run runs/facts/cooking/x",
                "validate facts-unit runs/facts/cooking/x/units/u1/out.1.json --run runs/facts/cooking/x",
                "merge facts apply --delta runs/facts/cooking/x/facts-delta.json --run runs/facts/cooking/x",
                "dump-workbook --manifest", "extract-attachment cooking",
                "transcribe cooking-2026-09-01", "allocate-id fact"):
        assert run(bash(f"DATA_ROOT=. {cli}"), tmp_path) == 0, cli
```

Run — the five block cases fail (exit 0, expected 2):

```bash
"<code-repo>/.venv/bin/pytest" "<data-repo>/.claude/hooks" -q -k "engine_common or facts_plan or merge_facts or python"
# expected: 5 failed, 4 passed (the two new allow cases plus the two
#           pre-existing python read tests)
```

#### Step 5.2 — the guard.

** In `<data-repo>/.claude/hooks/guard.py`, after the `ORDER_CURATE_RE`
definition (:52), insert:

```python
# The engine is driven through its CLIs; `facts_plan`, `merge_facts` and
# `engine_common` are internals. The v3 run (20260907-052345) had the
# coordinator importing them from `python3 -c` to dry-run the fold, which is
# how a coordinator that reads the delta starts authoring it (postmortem cause
# D). Matched as "a python invocation" × "an engine module named" — plus a
# `.py` under `runs/`, where the same import hides behind a file name. `uv run
# python …` needs no branch of its own: the space before `python` is the
# separator. A python command with neither (a `json.load` of a run file) is a
# read and stays allowed, as it always has been.
PYTHON_CMD_RE = re.compile(r"(?:^|[\s;&|()`])[\w./-]*python[0-9.]*\b")
ENGINE_MODULE_RE = re.compile(r"\b(?:facts_plan|merge_facts|engine_common)\b")
RUNS_SCRIPT_RE = re.compile(r"runs/\S*\.py\b")
```

In `main()`, immediately after the `ORDER_CURATE_RE` deny block (ends :108), insert:

```python
        if PYTHON_CMD_RE.search(cmd) and (ENGINE_MODULE_RE.search(cmd)
                                          or RUNS_SCRIPT_RE.search(cmd)):
            _deny("the engine is driven through its CLIs only: facts-plan, "
                  "validate, merge, dump-workbook, extract-attachment, "
                  "transcribe, allocate-id")
```

And in the module docblock's numbered list, after rule 4 (:19), add:

```
  5. No Bash `python`/`python3` that imports an engine module (`facts_plan`,
     `merge_facts`, `engine_common`) or runs a script under `runs/`: the engine
     is a set of CLIs, not a library the runtime may drive (addendum §3.6).
```

Run — everything green:

```bash
"<code-repo>/.venv/bin/pytest" "<data-repo>/.claude/hooks" -q
# expected: 72 passed
#   (65 before this task: 46 in test_guard.py, 19 collected from
#    test_playbook_lint.py; +7 here)
```

#### Step 5.3 — the playbook.

** Six edits in
`<data-repo>/.claude/skills/quantify/SKILL.md`. Each is an exact replacement.

(a) "Run every command bare" (:24–27) — add a second paragraph after it:

```markdown
And never through Python. `facts_plan`, `merge_facts` and `engine_common` are the engine's
internals; the seven CLIs above are its whole interface. A `python -c`, a `-m`, a heredoc or a
script under the run directory that imports one of them is blocked by the repository's guard, and
the thing it was reaching for is either a CLI flag or a defect to report.
```

(b) Stage P (:222) — replace

```markdown
It reads the dumps, the chosen transcripts, the cached attachment text and the store's identity
slice, and writes the skeleton, the plan, one `input.md` per unit, and the estate's function
library. It prints the unit count for the log — **nothing owner-facing**. Do not open what it wrote.
```

with

```markdown
It reads the dumps, the chosen transcripts, the cached attachment text and the store's identity
slice, and writes the skeleton, the plan, one `input.md` per unit, and the estate's function
library. Each `input.md` ends with the **shape section**, rendered from the store's own schema:
the closed key list per kind with the required keys marked, every enum's values, and a worked
`new[]` example — a paper form among them. That section is the unit's contract, and a key it does
not name is refused at the unit's gate. It prints the unit count for the log — **nothing
owner-facing**. Do not open what it wrote.
```

(c) Stage U's retry rule (:274–278) — replace

```markdown
**The retry rule.** A unit whose output fails validation is re-dispatched **once**, with
`attempt: 2`, its previous output path and the grouped errors. A unit at two attempts is `failed`
and the run continues without it; its candidates are reported as unexamined, never as dropped. A
truncated or unparseable file costs no attempt — `status` deletes it.
```

with

```markdown
**The retry rule — the cap is the engine's, not a choice.** A unit whose output fails validation
is re-dispatched **once**, with `attempt: 2`, its previous output path and the grouped errors.
There is no third attempt to give: `validate facts-unit` refuses `out.3.json` outright («attempt
cap: two per run») and `facts-plan status` reports that unit `failed`, which is what `assemble`
reads. The run continues without it; its candidates are reported as unexamined, never as dropped.
A truncated or unparseable file costs no attempt — `status` deletes it. Never ask the owner to
lift the cap: a unit that fails twice is a defect in the input or in the engine, and both are
reported after the run, not worked around during it.
```

(d) Stage U's yield rule (:285–288) — replace

```markdown
**The yield rule.** `status` prints `elapsed_s` and `yield`. `yield: true` is the **only** signal you
act on — never your own sense of how long this is taking. Check it after Stage 1, after Stage 2,
after Stage P, between batches, and before Stage R. On `yield: true`, send the progress line as the
**last message of the turn** and stop:
```

with

```markdown
**The yield rule.** `status` prints `elapsed_s` and `yield`. `yield: true` is the **only** signal you
act on — never your own sense of how long this is taking. Check it after Stage 1, after Stage 2,
after Stage P, between batches, and before Stage R. On `yield: true`, send the progress line as the
**last message of the turn** and stop. **You never continue past a `yield: true`** — not for one
more batch, not to finish validating a unit already returned, not because the next call is cheap.
Stopping is the engine's instruction, and the next message resumes it losslessly:
```

(e) Stage V (:329–338) — add, as the paragraph after the `(Drop `--review` …)` paragraph:

```markdown
**A per-entry error here is a defect, not your work.** Every per-entry rule — the store schema per
kind and the content pass — is enforced at each unit's own gate, so a delta assembled from
validated units cannot fail one (design addendum I1). What is left here is cross-entry only: twin
titles, instance ownership, refs between units, the reviewer's caps. If `validate facts-delta`
names a single entry's field anyway, stop before Gate B, report it in Persian as a defect, and
hand-repair nothing.
```

(f) Key invariants (:472) — replace

```markdown
- Batches of at most four `Task`s per message; every unit validated on return; at most two attempts
  per unit per run.
- The only yield signal is `facts-plan status`'s own `yield: true`.
```

with

```markdown
- Batches of at most four `Task`s per message; every unit validated on return; at most two attempts
  per unit per run — refused by the engine, never lifted.
- The only yield signal is `facts-plan status`'s own `yield: true`, and it ends the turn.
- The engine is driven through its CLIs only; no Python touches its internals.
```

#### Step 5.4 — the lint rule.

** Append to `<data-repo>/.claude/hooks/test_playbook_lint.py` (after
:224), and add the constant beside `KEYWORD_FENCE` (:44):

```python
#: Stage U's own section, heading to next heading. Two sentences of it are
#: mechanical rules of the engine (addendum §3.5), and prose that states a
#: mechanical rule is exactly the prose that drifts once the mechanism changes.
STAGE_U = re.compile(r"^## Stage U\b.*?(?=^## )", re.M | re.S)
```

```python
def test_stage_u_states_the_two_caps_as_the_engine_s():
    stage = STAGE_U.search(PLAYBOOK.read_text(encoding="utf-8"))
    assert stage is not None, "Stage U is gone from the playbook"
    text = stage.group(0)
    # §3.5's first cap: the engine refuses the third output, so the playbook may
    # not offer one — the v3 run's coordinator dispatched `out.3.json`.
    assert "refuses `out.3.json`" in text
    assert "Never ask the owner to lift the cap" in text
    # §3.5's second: `yield: true` is a stop, not a hint.
    assert "You never continue past a `yield: true`" in text
```

Run:

```bash
"<code-repo>/.venv/bin/pytest" "<data-repo>/.claude/hooks" -q
# expected: 73 passed
```

#### Step 5.5 — the agent.

** In `<data-repo>/.claude/agents/quantify.md`, after the "## The unit
contract" intro sentence (:56–57, ending "…and the file is authoritative."), insert:

```markdown
**The shape section at the end of your `input.md` is the contract for what you may write.** It
lists, per kind, the closed key list with the required keys marked, every enum's values, and a
worked example. A key that is not in it is refused at the gate — invent none, and write every
enum value in its own ASCII spelling, never translated. A **paper form** is a `new[]` record with
`medium: "paper"` and `location: {"kept_at": "…", "holder": "…"}` — where the blank and filled
forms are kept, and who holds them, both Persian prose.
```

Re-run the hook suite (the expression-card tests read this file):

```bash
"<code-repo>/.venv/bin/pytest" "<data-repo>/.claude/hooks" -q
# expected: 73 passed
```

#### Step (COMMIT)
Two commits, one per repository. The data-repo is the only one touched by this task, so the
code-repo commit does not exist here.

```bash
git -C "<data-repo>" add .claude/hooks/guard.py .claude/hooks/test_guard.py \
  .claude/hooks/test_playbook_lint.py .claude/skills/quantify/SKILL.md \
  .claude/agents/quantify.md
git -C "<data-repo>" commit -m "$(cat <<'EOF'
feat(guard,quantify): the engine is CLIs only, and the two caps are the engine's

The v3 run drove `facts_plan` and `merge_facts` from `python3 -c` to dry-run
the fold, dispatched a third attempt for one unit, and ended by asking the
owner to lift the cap (addendum §3.5, §3.6). The guard now blocks a python
invocation that imports an engine module or runs a script under `runs/`; the
playbook states the attempt cap and the yield stop as rules of the engine, and
a new lint test holds both sentences in place; the agent is told the shape
section is its contract.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```

---

### Task 6: The panel shows a paper record's location

**Addendum:** §3.3's last line — "The UI's RecordCard renders `kept_at`/`holder` in the
«نسخه‌ها» band when there are no instances."

#### Files

| file | anchor | change |
|---|---|---|
| `<code-repo>/ui/src/lib/factsLabels.ts` | `ISSUE_KIND_LABELS` (:231–250), `PAYLOAD_FIELD_LABELS` (:414 `location`) | 4 labels |
| `<code-repo>/ui/src/lib/factsLabels.test.ts` | :202–210 (the issue-kind list) | 1 value |
| `<code-repo>/ui/src/api/types.ts` | :304–318 | the four-shape union |
| `<code-repo>/ui/src/facts/cards/RecordCard.tsx` | `StructureCard` :509–567 | the three rows |
| `<code-repo>/ui/src/facts/cards/RecordCard.test.tsx` | after :398 | 1 fixture, 2 tests |

#### Interfaces

```ts
// ui/src/api/types.ts
export interface IdentifierScheme { authority?: string; format?: string }
export interface SheetLocation {
  path?: string; spreadsheetId?: string; sheet?: string; sheetId?: number; hidden?: boolean
}
export interface PaperLocation { kept_at: string; holder: string }
export interface ExternalLocation { system: string; kept_at: string; identifier_scheme?: IdentifierScheme }
export interface NativeLocation { kept_at: string; identifier_scheme?: IdentifierScheme }
export type RecordLocation = SheetLocation | PaperLocation | ExternalLocation | NativeLocation
// RecordData.location: RecordLocation
```

`RecordCard` reads the union through one widened annotation
(`Partial<SheetLocation & PaperLocation & ExternalLocation & NativeLocation>`): `medium` is the
discriminant and it lives on the parent, so narrowing the location alone is impossible without
turning `RecordData` itself into a union — which every card and route would then have to narrow.
Authors are held to the union; the one reader reads it flat.

#### Steps
#### Step 6.1 — the labels gate, first.

** It already fails: Task 4 put `unread_attachment` into
`issue.kind`, and the gate walks `facts.schema.json`'s enums.

```bash
npm --prefix ui run test -- factsLabels
# expected: 1 failed —
#   AssertionError: expected [ 'facts.schema.json/$defs/issue/properties/kind → unread_attachment' ]
#   to deeply equal []
```

#### Step 6.2 — the labels.

** In `ui/src/lib/factsLabels.ts`, add to `ISSUE_KIND_LABELS` after
`binding_gone` (:249):

```ts
  unread_attachment: 'فایل خوانده‌نشده',
```

and to `PAYLOAD_FIELD_LABELS`, immediately after `location: 'محل',` (:414):

```ts
  // §3.3 — `location`'s non-sheet shapes. A paper form and an external table
  // have no path and no tab; what says where they are is where they are kept
  // and who holds them.
  kept_at: 'نگهداری',
  holder: 'مسئول',
  system: 'سامانه',
```

Extend the existing issue-kind test's list (`factsLabels.test.ts` :203–207) with
`'unread_attachment'` as its last member.

```bash
npm --prefix ui run test -- factsLabels
# expected: 14 passed
```

#### Step 6.3 — the card's tests, next (they fail).

** Append inside `describe('the record card', …)`
in `ui/src/facts/cards/RecordCard.test.tsx`, before its closing `})` (:399):

```tsx
  /** §3.3 — a paper form's closed `location`: where the forms are kept and who
   *  holds them. The 2026-09-07 run wrote two of these with no `location` at
   *  all and invented keys instead, and the panel had nothing to draw. */
  const KEPT = (over: Record<string, unknown> = {}): FactBundle => bundleOf('record', {
    medium: 'paper', role: 'log',
    location: { kept_at: 'قفسهٔ دفتر انبار', holder: 'مسئول انبار' },
    cadence: 'nightly',
    ...over,
  })

  it('draws a paper form’s «نگهداری» and «مسئول» where a sheet draws its path', () => {
    draw(KEPT())
    expect(screen.getByText('نگهداری')).toBeInTheDocument()
    expect(screen.getByText('قفسهٔ دفتر انبار')).toBeInTheDocument()
    expect(screen.getByText('مسئول')).toBeInTheDocument()
    expect(screen.getByText('مسئول انبار')).toBeInTheDocument()
    // Both are Persian prose, so neither is an LTR island (note 6 / QF-42):
    // `Mono` is for a stored latin run, and there is none here.
    expect(screen.getByText('قفسهٔ دفتر انبار')).not.toHaveAttribute('dir')
    // …and the empty «محل» row is gone rather than drawn as «—».
    expect(screen.queryByText('محل')).toBeNull()
  })

  it('names the outside system for an external table', () => {
    draw(KEPT({ medium: 'external', location: { system: 'سپیدز', kept_at: 'گزارش فروش روزانه' } }))
    expect(screen.getByText('سامانه')).toBeInTheDocument()
    expect(screen.getByText('سپیدز')).toBeInTheDocument()
    expect(screen.getByText('نگهداری')).toBeInTheDocument()
    expect(screen.queryByText('مسئول')).toBeNull()
  })
```

```bash
npm --prefix ui run test -- RecordCard
# expected: 2 failed, 25 passed — "Unable to find an element with the text: نگهداری"
```

#### Step 6.4 — the types.

** In `ui/src/api/types.ts`, replace the docblock and the `location` member
(:304–318) with:

```ts
/**
 * `record.data` (§7). `medium`, `role` and `location` are required.
 *
 * A row is `{ key, … }` plus one property per column, so it cannot be typed
 * more tightly than `Record<string, unknown>` without freezing the store —
 * the same reason the schema leaves `data` an open object.
 *
 * `location` is the exception, as of the 2026-09-07 addendum §3.3: it is an
 * `if/then` on `medium` in the schema, and the four shapes below are that
 * `if/then`. The discriminant sits on the parent, so a reader narrows on
 * `medium` and not on the location object.
 */
export interface IdentifierScheme { authority?: string; format?: string }
/** `medium: 'sheet'` — engine-written, and the only shape with a locator. */
export interface SheetLocation {
  path?: string; spreadsheetId?: string; sheet?: string; sheetId?: number
  hidden?: boolean
}
/** `medium: 'paper'` — where the blank and filled forms are kept, who holds them. */
export interface PaperLocation { kept_at: string; holder: string }
/** `medium: 'external'` — the outside system, and where inside it. */
export interface ExternalLocation {
  system: string; kept_at: string; identifier_scheme?: IdentifierScheme
}
/** `medium: 'native'` — a table the estate keeps itself. */
export interface NativeLocation { kept_at: string; identifier_scheme?: IdentifierScheme }
export type RecordLocation =
  SheetLocation | PaperLocation | ExternalLocation | NativeLocation

export interface RecordData {
  medium: 'sheet' | 'paper' | 'external' | 'native'
  role: 'log' | 'reference' | 'report' | 'config'
  location: RecordLocation
```

#### Step 6.5 — the card.

** In `ui/src/facts/cards/RecordCard.tsx`, `StructureCard`:

Replace `const loc = data.location ?? {}` (:515) with

```tsx
  // The union's four shapes read flat: `medium` is the discriminant and it is
  // one level up, so narrowing here would mean turning `RecordData` into a
  // union and narrowing it in every card. Authors are held to the union in
  // `types.ts`; this one reader takes the widened view.
  const loc: Partial<SheetLocation & PaperLocation & ExternalLocation & NativeLocation> =
    data.location ?? {}
```

(and add the four names to the existing `import type … from '../../api/types'`).

After the `format` const (:545) add:

```tsx
  // §3.3 — a paper form, an external table and a native one have no locator at
  // all; `where` would be «—» and say nothing. Draw «محل» only when it has
  // something to carry, and the kept-at rows in its place when it does not.
  const hasWhere = loc.path !== undefined || loc.sheet !== undefined
    || loc.identifier_scheme?.authority !== undefined
```

Replace the `instances.length === 0 && (…)` block (:559–567) with:

```tsx
      {instances.length === 0 && (hasWhere || loc.kept_at === undefined) && (
        <LabelRow text={L('location')}>
          {where}
          {format !== undefined && (
            <Filled text={label(SCREEN_LABELS, 'location_format')} values={{ n: format }}
              className="text-fs-micro text-faint" />
          )}
        </LabelRow>
      )}
      {instances.length === 0 && loc.system !== undefined && (
        <LabelRow text={L('system')}>
          <span className="text-fs-menu font-semibold text-ink">{loc.system}</span>
        </LabelRow>
      )}
      {instances.length === 0 && loc.kept_at !== undefined && (
        <LabelRow text={L('kept_at')}>
          <span className="text-fs-menu text-ink">{loc.kept_at}</span>
        </LabelRow>
      )}
      {instances.length === 0 && loc.holder !== undefined && (
        <LabelRow text={L('holder')}>
          <span className="text-fs-menu text-ink">{loc.holder}</span>
        </LabelRow>
      )}
```

Extend the `Instances` docblock (:736–738) — the sentence "A paper form and an external table
keep the old row" is now half true:

```tsx
 * A paper form, an external table and a native one keep this region without
 * instances: a `location` chosen by `medium` (§3.3), drawn as «محل» when it
 * carries a locator and as «نگهداری» / «مسئول» / «سامانه» when it does not.
```

```bash
npm --prefix ui run test -- RecordCard
# expected: 27 passed
npm --prefix ui run test -- factsLabels
# expected: 14 passed
```

#### Step (COMMIT)
```bash
git -C "<code-repo>" add ui/src/api/types.ts ui/src/lib/factsLabels.ts \
  ui/src/lib/factsLabels.test.ts ui/src/facts/cards/RecordCard.tsx \
  ui/src/facts/cards/RecordCard.test.tsx
git -C "<code-repo>" commit -m "$(cat <<'EOF'
feat(ui): a paper record says where its forms are kept and who holds them

`recordData.location` closed per `medium` (addendum §3.3), so the panel's
location row — built for a path and a tab — had nothing to draw for the two
paper forms the 2026-09-07 run produced. `RecordData.location` becomes the
four-shape union, and the structure card draws «نگهداری» / «مسئول» / «سامانه»
in place of an empty «محل». `unread_attachment` gets its Persian word, which
is what the QF-42 gate was failing on.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```

---

### Task 7: The written record

**Addendum:** §1–§4. No code. Four files, each getting the smallest edit that makes the
addendum findable from where a reader already is.

#### Files

| file | anchor | change |
|---|---|---|
| `docs/superpowers/specs/2026-09-06-quantitative-facts-v3-design.md` | :110 (§2.4), :118 (§2.5), :224 (§3.3), :240 (§4 `validate` row) | one sentence each |
| `docs/runbooks/07-facts.md` | :439 (end of §10), :446 (after §11's table), new §12 before `## Next` (:490) | three additions |
| `docs/decisions/0017-facts-pipeline-v3.md` | end of file (after :146) | an addendum section |
| `docs/decisions/README.md` | :25 | the 0017 row |

#### Steps
There is no test here; the check is that the spec is not rewritten — each edit is **additive**
and names the addendum, so the v3.3 text stays the record of what was designed on 2026-09-06 and
the addendum stays the record of what changed on 2026-09-07.

#### Step 7.1 — the design spec, four sentences.

§2.4, appended to the paragraph ending «…arrive as tool results in this same turn» (:114):

```markdown
**Amended 2026-09-07** (addendum §3.2): the prompt gains the **shape section**, rendered into
every `input.md` from `facts.schema.json` at build time — the closed key list per kind, every
enum's values and a worked `new[]` example. The prompt's sentence is "the shape section is the
contract; a key not in it is refused".
```

§2.5, inserted directly under the heading (:118):

```markdown
> **Amended 2026-09-07** (addendum §3.1, invariant I1): this contract closes the unit's *keys*
> but left its *values* open, and `validate facts-unit` never checked the entry a decision would
> become. It now materialises every `keep` and `split` and validates the result against
> `facts-delta.schema.json` and the content pass, so a per-entry refusal after this gate is a
> defect.
```

§3.3, inserted directly under the heading (:224):

```markdown
> **Amended 2026-09-07** (addendum §3.3, §3.7): `recordData.location` closes as an `if/then` on
> `medium` — sheet `{path, spreadsheetId, sheet}`, paper `{kept_at, holder}`, external
> `{system, kept_at}`, native `{kept_at}` — and `issue.kind` gains `unread_attachment`.
```

§4's `validate` row (:240), appended inside the cell:

```markdown
**Amended 2026-09-07** (addendum §3.1, §3.4, §3.5): `facts-unit` additionally materialises each
`keep`/`split` decision and validates the resulting entries as a delta document against the store
schema per kind and `merge_facts.content.check_document`; it refuses `units/<u>/out.<n>.json`
with `n > 2` («attempt cap: two per run»), which `status` reports as `failed` and `assemble`
treats as failed. Grouped errors become one line per distinct rule with the field path —
`entries[3].data.fields[2].type: 'text' is not one of […]` — capped at 80 lines, never truncated
to five and never an entry dump.
```

#### Step 7.2 — the runbook.

** Append to §10, after the "(d) the playbook uses only …" paragraph (:439):

```markdown
(e) two rules of the run are the **engine's**, not the operator's, and neither is liftable from
the playbook or from this checklist: a unit gets **two attempts per run** — `validate facts-unit`
refuses a third output, `facts-plan status` reports that unit `failed`, and `assemble` continues
without it — and `yield: true` **ends the turn**: the coordinator sends its progress line and
stops. A request to lift either is a bug report, not a decision to take at the console.
```

Add after §11's table (:446), before the "**No other question…**" paragraph:

```markdown
A third line runs through both files: **a file this run could not read is named once.** An
extension `extract-attachment` has no converter for, or a supported file whose cached text is
missing, becomes an `unread_attachment` issue and is listed under «فایل‌هایی که در این اجرا
خوانده نشدند», beside an unplaced workbook — by the owner-visible name of the file and never by a
path. No unit ever sees it, and nothing is improvised over it (design addendum I2).

Validator output has the opposite contract and is **never** owner-facing: one line per distinct
rule, `<path>: <rule> (<n> places: <first three paths>)` — e.g. `entries[3].data.fields[2].type:
'text' is not one of ['string','number','integer','boolean','date']` — with no entry dumps and a
cap of 80 lines. It is read by the coordinator, pasted into a re-dispatch, and quoted to nobody.
```

New §12, inserted before `## Next` (:490):

```markdown
## 12. Why the final validation cannot refuse a single entry (invariant I1)

On 2026-09-07 the cooking run assembled 220 entries and the final validation refused 52 of them —
17 records, 5 measurements, 30 rules — on **shape** alone: a column type written as `text`, a
computed column marked yes/no instead of a reference, a cadence written in Persian words instead
of its enum value, rules with no inputs or outputs, two paper forms with invented keys and no
location. Nothing was wrong with the content, and by then every unit and the reviewer had spent
their attempts. The store's closed contract was being applied for the first time after the last
gate that could act on it.

**The output side is closed at the unit's gate now.** Whatever a unit writes, from whatever
evidence — a sheet, a transcript, a `.docx`, a `.pdf`, a photograph, something said out loud — is
validated at `validate facts-unit` against the same per-entry contract `merge facts apply`
enforces: the store schema for its kind, and the content pass. The final validation keeps only
what is genuinely cross-entry — twin titles, instance ownership, references between units, the
reviewer's caps — and each of those already names the unit that caused it.

So the operator's reading of a failure changes: **a per-entry error at the final validation is a
defect in the engine, not a unit to re-dispatch.** Stop the run before the checkpoint, record the
message as it is, and report it. There is nothing to hand-repair — the delta is the assembly of
every unit, and a hand-edited delta is how the 2026-09-02 run ended.
```

#### Step 7.3 — ADR 0017.

** Append to `docs/decisions/0017-facts-pipeline-v3.md` (after :146):

```markdown
## Addendum — 2026-09-07: the unit gate closes

The first real v3 run (cooking, `20260907-052345`) reached the end of the pipeline: fourteen units
and the review passed their gates, `assemble` produced 220 entries, and the final validation
refused **52 of them** — 17 records, 5 measurements, 30 rules — on shape alone. Column types
written as `text`; a computed column marked yes/no instead of a reference; `cadence` and
`quantity` in Persian words rather than their enum values; rules with no `inputs`/`outputs`; and
two paper forms photographed in the meeting written as records with invented keys and no
`location`. The content was right. Three causes, all of them structural:

- `facts-unit.schema.json` closes a decision's **keys** and leaves its **values** open, and
  `validate facts-unit` never checked the entry a decision would become — so the store's closed
  contract was first applied after every unit and the reviewer had spent their attempts.
- The unit was never shown that contract: `input.md` carried the expression and style cards, not
  the payload shapes, so a record with no workbook candidate — a paper form, whatever medium it
  arrived in — was authored freehand.
- `engine_common.validate` reported the first five errors on one line, and for an `entries[N]`
  `oneOf` failure that line was the whole entry. The coordinator chased five at a time,
  re-dispatched a unit past the two-attempt cap (one reached `out.3.json`), ran engine internals
  from Python to dry-run the fold, and ended by asking the owner to lift the cap — postmortem
  causes D and H, unchanged by v3 because v3 had made neither cap mechanical.

The remedy is two invariants, designed in
`docs/superpowers/specs/2026-09-07-quantitative-facts-v3-gate-design.md`. **I1 — the output side
is closed at the unit's gate:** whatever a unit writes is validated there against the same
per-entry contract `apply` enforces, and a per-entry refusal after it is a defect. **I2 — the
intake is explicit:** a file `extract-attachment` cannot read is recorded as an `unread_attachment`
issue and named once to the owner, never improvised over. With them: the shape section rendered
into every `input.md` from the schema itself, `location` closed per `medium`, field-path error
lines with no truncation, the attempt cap and the yield stop enforced by the engine, and a guard
that blocks driving the engine from Python. No new file-type branch anywhere in the units — I1
and I2 are the mechanism.
```

#### Step 7.4 — the ADR index.

** In `docs/decisions/README.md`, append to the 0017 row (:25), before its
closing `|`:

```markdown
; **addendum 2026-09-07** — the first real run refused 52 of 220 entries on shape at the last
gate, so the gate moves: `validate facts-unit` materialises every decision and validates it
against the store contract (I1), the two-attempt cap and the yield stop become rules of the
engine, `record.location` closes per `medium`, an unreadable attachment becomes an
`unread_attachment` issue instead of a guess (I2), and the guard blocks driving the engine from
Python
```

#### Step 7.5 — the check.

** Markdown only; nothing to run but the links:

```bash
grep -c "2026-09-07-quantitative-facts-v3-gate-design" \
  "<code-repo>/docs/superpowers/specs/2026-09-06-quantitative-facts-v3-design.md" \
  "<code-repo>/docs/decisions/0017-facts-pipeline-v3.md"
# expected: …v3-design.md:0   …0017-facts-pipeline-v3.md:1
#   (the spec's four edits name "the 2026-09-07 addendum" in prose, since it
#    sits beside them in the same directory; the ADR carries the path)
ls "<code-repo>/docs/superpowers/specs/2026-09-07-quantitative-facts-v3-gate-design.md"
# expected: the path, so the ADR's link resolves
```

#### Step (COMMIT)
```bash
git -C "<code-repo>" add docs/superpowers/specs/2026-09-06-quantitative-facts-v3-design.md \
  docs/runbooks/07-facts.md docs/decisions/0017-facts-pipeline-v3.md docs/decisions/README.md
git -C "<code-repo>" commit -m "$(cat <<'EOF'
docs(facts): record the unit gate — the addendum, the two engine rules, §12

The v3 design, the runbook and ADR 0017 all describe a pipeline whose per-entry
contract was applied at the last gate. Each now points at the 2026-09-07
addendum where it is wrong rather than being rewritten: four sentences in the
design spec, the attempt cap and the yield stop in the pre-run checklist, the
unread-files line and the field-path error form in the message contracts, a new
§12 on why the final validation cannot refuse a unit's entry, and an addendum
paragraph in 0017 with the run's evidence — 52 of 220, and the three causes.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_013qm3WA2XpDZ6sTbp1t2VRt
EOF
)"
```

---

#### Drafting notes (kept for the executor)

- **Task ordering.** 5, 6 and 7 are independent of each other and of Tasks 1–4 *at the file
  level*, but two runtime dependencies are real: Task 6.1's "run the gate first" only fails if
  Task 4 (`issue.kind` gains `unread_attachment`) has landed, and Task 5's playbook sentences
  describe behaviour Task 1 (`validate facts-unit` refuses `out.3.json`) implements. Land 1–4
  first or the "expected: failing" outputs above are wrong in the other direction.
- **Test counts.** 65 hook tests before Task 5 (46 in `test_guard.py`; `test_playbook_lint.py`
  collects 19 from 11 defs, two of them parametrised over 8 + 2 cases) → 73 after. `RecordCard`
  25 → 27; `factsLabels` stays at 14 (the new label is asserted inside an existing test).
- **The «نسخه‌ها» wording.** The addendum §3.3 says the paper location renders "in the «نسخه‌ها»
  band". Taken literally that contradicts `RecordCard.tsx`:728–738 and the passing test at
  `RecordCard.test.tsx`:373 — «نسخه‌ها» is the eyebrow of the *instances* band and its whole
  point is that it replaces the location row. Task 6 puts the rows in that band's counterpart:
  the no-instances region of `StructureCard`, where «محل» lives. If the owner meant the eyebrow
  literally, one label swap does it, and the :373 test flips.
- **`identifier_scheme` is not in the addendum's table.** It is in `types.ts` today and drawn as
  «قالب» by a passing test (`RecordCard.test.tsx`:296, the Sepidz till `F-00018`). Task 6 keeps
  it as an optional member of the external and native shapes; if Task 3's schema `if/then` sets
  `additionalProperties: false` on those branches without it, that stored entry stops validating
  and the schema, not the UI, is the thing to fix.
- **Not done here.** The guard's regex pair is a text match on the command string, so
  `PYTHONPATH=… python -c "exec(open(x).read())"` with the import inside `x` still passes; that
  is a knowingly shallow ceiling and the right depth for a hook whose job is stopping the
  coordinator's own habit, not an adversary.

---

### Task 8: Acceptance — the existing cooking run, headless in the container (addendum §3.9)

An operational task run by the controller, not a code change. It proves I1 on real model output
before the owner touches the bot again. Nothing under `data-repo/runs/facts/cooking/20260907-052345`
is edited by hand; every write is the engine's or the agent's, through the playbook.

**Files:**
- Reads: `docs/runbooks/07-facts.md` §10–§12, `data-repo/.claude/skills/quantify/SKILL.md`, the run directory
- Writes (through the engine and the agent only): `data-repo/runs/facts/cooking/20260907-052345/**` (new `out.<n>.json`, `review/`, `facts-delta.json`, `assembly.json`, `gate-b.md`, `report.md`, `meta.json`), `data-repo/facts/*` (by `merge facts apply` at Stage 5), the data-repo's Stage 6 commit (made by the playbook inside the container)

**Interfaces:**
- Consumes: everything T1–T7 produced, merged into both mains and rebuilt into the local images.
- Produces: the cooking store rebuilt from the v3 pipeline, `report.md`, and a readiness verdict for the owner.

- [ ] **Step 1: Merge and rebuild (host)**

Both plan worktrees merge into their mains (no push); then, in this order, because the control-bot's bind mount caches renamed git files:

```bash
cd "<code-repo>" && git merge --no-ff facts-v3-gate && VIRTUAL_ENV=.venv uv pip install -e engine -q && npm --prefix ui run build
cd "<data-repo>" && git merge --no-ff facts-v3-gate && git status --short   # must be empty
cd "<code-repo>" && docker compose -f deploy/docker-compose.local.yml build control-bot ui-backend upload-bot
docker compose -f deploy/docker-compose.local.yml up -d control-bot ui-backend upload-bot
docker exec inja-food-process-local-control-bot-1 sh -c 'cd /data && git rev-parse HEAD && git status --short | wc -l'
```

Expected: the container's HEAD equals the host's and its status count is `0`. If not, `docker compose restart control-bot` and check again (the cache).

- [ ] **Step 2: Re-validate the fourteen existing outputs under the new gate (container)**

```bash
docker exec -w /data -e DATA_ROOT=/data -e SCHEMA_DIR=/opt/schemas inja-food-process-local-control-bot-1 \
  facts-plan status --run runs/facts/cooking/20260907-052345
```

Expected: fourteen lines; the units whose latest output the closed gate refuses now read `failed` (the run showed 17 records, 5 measurements and 30 rules with shape errors, so expect most workbook units and the items unit to fail), and the last line names stage `U`, `plan_stale false`. For one failed unit, run `validate facts-unit runs/facts/cooking/20260907-052345/units/<u>/out.<n>.json --run runs/facts/cooking/20260907-052345` and confirm every line is a field-path line, none a dumped entry, and none exceeds the 80-line cap.

- [ ] **Step 3: Drive the playbook headless, as the owner's proxy (container)**

The same runtime the bot uses: `claude` in `/data` with the project's `CLAUDE.md`, skills and hooks, the bot's tool set and model. Each invocation is one turn; the playbook ends a turn at a yield and at each gate, so the controller resumes with the owner's reply.

```bash
C=inja-food-process-local-control-bot-1
docker exec -w /data -e DATA_ROOT=/data -e SCHEMA_DIR=/opt/schemas -e CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 $C \
  claude -p "/quantify cooking" --model 'claude-opus-5[1m]' --permission-mode bypassPermissions \
  --allowedTools Read,Write,Edit,Bash,Glob,Grep,Task --max-turns 200 \
  --output-format stream-json --verbose > /tmp/acc-turn-1.jsonl
```

Read the last assistant text of the stream (the owner-facing message). Then, per the message:
- a progress line ending in «برای ادامه «ادامه بده» را بفرستید» → resume with `claude -p "ادامه بده" --continue …` (same flags) into `/tmp/acc-turn-<n>.jsonl`;
- Gate M → cannot occur (all 28 rows confirmed); if it does, stop and report;
- Gate B → resume with the approval the playbook's Gate B block asks for (approve every item, answer no dispute: the owner's proxy only ever approves; a dispute answer is the owner's);
- the Stage 7 report → done.

Expected across the turns: `facts-plan status` between batches shows the re-dispatched units reaching `done` within the cap (a unit already at `out.2.json` that fails again stays `failed` and its candidates go to `undecided[]` — that is the cap working, not a defect); `assemble` exits 0; `validate facts-delta --store --run` exits 0 with **no** per-entry error (I1 — a per-entry error here fails the acceptance); `merge facts apply` runs; `report.md` exists; the Stage 6 commit is made inside the container by the playbook.

- [ ] **Step 4: Verify (host, read-only on the data-repo; git only through the container)**

```bash
docker exec -w /data $C sh -c 'git log --oneline -2; cat facts/.id-seq.json; python3 -c "import json;print({k: len(json.load(open(\"facts/\"+k+\".json\"))[\"entries\"]) for k in (\"items\",\"records\",\"rules\",\"measurements\",\"notes\")})"; DATA_ROOT=/data SCHEMA_DIR=/opt/schemas merge facts check | tail -1'
grep -c -E "T-|S-|N-|u-|/" "<data-repo>/runs/facts/cooking/20260907-052345/report.md"   # expect 0 (no internals)
```

Expected: the first new id is `F-00002`; `report.md` names the unread files (the two photos are read, so none from them), the dropped candidates by reason, and no dispute the controller answered; `merge facts check` ends with `readiness: … lint_failures=0 expr_missing=0`.

- [ ] **Step 5: Record**

Append to the plan's ledger: the number of units re-dispatched, the attempt counts, the cost (from the stream's final `result` records), every owner-facing message the controller answered and with what, and every message the controller could not answer as a proxy (a dispute), which stays open for the owner. Then hand the owner `report.md`'s content and the readiness line — not a bug list.
