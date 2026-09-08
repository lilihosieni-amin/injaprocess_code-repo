# Quantitative Facts v3 — Acceptance-Run Fixes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the twelve problems the first headless run surfaced (spec §1), keeping I1 and I2 and adding I3 (a tombstoned process is never read as content), then reset the store so the owner's next run is a first run.

**Architecture:** Every new per-entry check lives in one function both gates call (`_contract_problems` at the unit gate and the assembly; `preconditions` at apply/simulate), so the unit gate and the store gate cannot drift. The card and the prompts tell the unit the three things it guessed wrong (unit symbols, item-keyed cells, parameter-bound inputs). Intake recursion goes through the one `find_attachments` every reader shares.

**Tech Stack:** Python 3.11/3.12 (`jsonschema` via `engine_common.validate`), pytest; React + TypeScript with vitest (`ui/`); Claude Code runtime prompts in Markdown (`data-repo/.claude/`).

**Spec:** `docs/superpowers/specs/2026-09-08-quantitative-facts-v3-acceptance-fixes-design.md` (addendum v3.5). Its §2 invariants are the acceptance criteria.

## Global Constraints

- All components communicate only through the filesystem under `DATA_ROOT`; engine CLIs are deterministic, check preconditions, and `exit 2` with nothing written on failure (ARD §7).
- IDs are minted only by `allocate-id` from `merge facts apply`; `validate`, `status`, `assemble`, `simulate` never mint and never write the store (INV-1).
- **I1:** anything `validate facts-unit` accepts, `assemble` + `simulate` cannot refuse per entry — every new check runs at both gates from one function.
- **I2:** every plain file under `attachments/**` except `sheets/`, `.text/` and dot-directories is read or listed as unread.
- **I3:** a file with `tombstoned: true` is absent from the process index, refused as a citation and as a `process` source, at both gates.
- Engine messages are English, one line per refusal, `<label>: <path>: <rule>`; the label is the decision or `new[]` label the unit gate already uses.
- Owner-facing text (`gate-b.md`, `report.md`, `ISSUE_FA`, the card's Persian prose, the playbook's Persian blocks) carries no command, path, account id, unit id, stage letter or department code; a file's own relative name is allowed.
- Tests are scoped: `.venv/bin/pytest -q -k "<expr>"` from the code worktree root; never explicit test file paths from a worktree; ui tests via `npm --prefix ui run test -- <pattern>` from the worktree root; data-repo hook tests via the code venv's pytest on the data worktree's `.claude/hooks`.
- Commits: one per task, named paths only, footer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01DPTHdFJLvB9Zr9hb1AySvY
  ```
  Never push. Never run git on the data-repo from the host while the control-bot is running a session; after any host-side git operation on the data-repo, restart the control-bot before it runs git.
- Workspaces: code-repo worktree `.claude/worktrees/facts-v3-gate` (branch `facts-v3-gate`, continues from 5be6ed3); data-repo worktree `../../../data-repo.facts-v3-gate` (branch `facts-v3-gate`, from a7626d3 — rebase onto the data-repo main's current head first, it merged at 3e22ded and the run commit 6ccf313 sits above it; the reset in Task 9 drops 6ccf313).

## File structure

| file | responsibility |
|---|---|
| `engine/facts_plan/build.py` | T1 `process_index` skips tombstones; T3 `_render_candidate` parameter lines; T4 `shape_section(symbols)` + «واحدهای مجاز» + two sentences |
| `engine/merge_facts/preconditions.py` | T1 `process_source_problems` |
| `engine/facts_plan/assemble.py` | T1 `_contract_problems` calls it; T2 `_pseudo` carries `data`; T3 the bound-input check; T4 `_digest_text` passes symbols |
| `engine/extract_attachment/__init__.py` | T5 `find_attachments` recursion + nested cache names |
| `engine/facts_plan/build.py` `_attachment_state` | T5 follows `find_attachments` |
| `engine/tests/test_facts_plan_edges.py`, `test_validate_facts_unit.py`, `test_facts_plan_assemble.py`, `test_facts_plan_cards.py`, `test_facts_plan_units.py`, `test_extract_attachment.py`, `test_merge_facts_preconditions.py` (or the nearest existing) | T1–T5 |
| `data-repo/.claude/agents/quantify.md`, `.claude/hooks/test_playbook_lint.py` | T6 |
| `ui/src/facts/cards/RuleCard.tsx`, `RuleCard.test.tsx` | T7 |
| `docs/runbooks/07-facts.md`, `docs/decisions/0017-facts-pipeline-v3.md`, `docs/superpowers/specs/2026-09-06-…-design.md` (§2.3 one sentence) | T8 |
| (operational) | T9 merge, rebuild, reset, restart |

Order: T1 → T2 → T3 → T4 → T5 (they share `build.py`/`assemble.py`); T6 ∥ T7 ∥ T8 alongside; final whole-branch review; T9.

---

### Task 1: Tombstones are never read (spec §3.1, I3)

**Files:** `engine/facts_plan/build.py` (`process_index`, ~1318); `engine/merge_facts/preconditions.py` (new `process_source_problems`, beside `_source_path_problems`); `engine/facts_plan/assemble.py` (`_contract_problems`, ~227); tests `engine/tests/test_facts_plan_edges.py` (beside `test_process_index_and_ranking`), `engine/tests/test_validate_facts_unit.py`, the preconditions test module.

**Interfaces:** Produces `merge_facts.preconditions.process_source_problems(root, entry) -> list[str]` — one line per `source[]` member of type `process` whose file is missing or `tombstoned`, `source[<n>]: process <id> is tombstoned` / `source[<n>]: process <id> has no file`; the caller prefixes the label. `simulate`/`apply` call it in the per-entry precondition pass; `_contract_problems` calls it over each materialised entry.

- [ ] **Step 1 (RED):** a test that writes a department with one live and one tombstoned process file (`{"id": "cooking-002", "tombstoned": true, "superseded_by": ["cooking-030"], "nodes": [{"id": "n1", "label": "…"}]}`) and asserts `process_index` returns no node of the tombstoned one; a unit-gate test where a decision cites `{"process": "cooking-002", "node": "n1"}` and `validate_unit` returns `[…: node n1 is in no process of cooking]`; a materialised test where a `new[]` entry's citation is live at the index but the file is tombstoned (write the tombstone after build) and the gate returns `new[0] …: source[<n>]: process cooking-002 is tombstoned`, and `simulate` over the same delta returns the same sentence (I1 both ways).
- [ ] **Step 2 (GREEN):** `process_index` skips `doc.get("tombstoned")`; `process_source_problems` in preconditions; wired into the precondition pass and `_contract_problems`.
- [ ] **Step 3:** `.venv/bin/pytest -q -k "facts_plan_edges or validate_facts_unit or merge_facts or facts_plan_assemble"`; commit `feat(facts): a tombstoned process is never read — index, citation, source, both gates`.

### Task 2: Hedge wrappers on `new[]` entries (spec §3.4)

**Files:** `engine/facts_plan/assemble.py` (`_pseudo`, ~500; `_entry` ~792); test `engine/tests/test_validate_facts_unit.py`.

- [ ] **Step 1 (RED):** a `new[]` paper record with `"filled_by": {"value": "سرآشپز", "inferred": true}` and `"location": {"kept_at": {"value": "زونکن دفتر", "inferred": true}, "holder": "سرآشپز"}`: `validate_unit` must return `[]`; `assemble` must write the entry with `filled_by == "سرآشپز"` and `field_status == {"data/filled_by": "inferred", "data/location/kept_at": "inferred"}`; `simulate` `[]`. Today the gate returns `data.filled_by: {…} is not of type string`.
- [ ] **Step 2 (GREEN):** `_pseudo` puts the entry's `data` on the pseudo decision (`"data": copy.deepcopy(entry.get("data") or {})`) and leaves the candidate payload `{}` (or whatever `_entry` needs to keep the mechanical merge order right — read `_entry` first; the requirement is that `_unwrap` sees the `new[]` data).
- [ ] **Step 3:** scoped tests as in Task 1; commit `fix(facts): a new entry's hedge wrappers are unwrapped like a decision's`.

### Task 3: Parameter-bound inputs (spec §3.2)

**Files:** `engine/facts_plan/build.py` (`_render_candidate`, ~1956); `engine/facts_plan/assemble.py` (`_contract_problems` or `_lint_decision`); tests `engine/tests/test_facts_plan_cards.py` or `test_facts_plan_units.py` (rendering), `engine/tests/test_validate_facts_unit.py` (the check).

**Interfaces:** the first binding's `params` values are numbers, `{"ref": "S-rec-…", "field": "c_h"}` or table names; the record candidate's `payload["fields"]` carry `key` (provisional `c_<letter>`) and `title` (header text).

- [ ] **Step 1 (RED):** rendering: a rule candidate whose first binding has `ref_1 → {ref: S-rec-A, field: c_f}` and `tolerancePerFoodGr → 5` renders the lines `ref_1 → «<record label>» ستون f «<header title>»` and `tolerancePerFoodGr → 5` under the candidate line. The check: a rule decision with inputs `[{key: "mojudi_avval_shab", from: {param: "ref_1"}}, {key: "daryaft_az_anbar", from: {param: "ref_2"}}]` where the bindings map `ref_1 → c_f` and the owning record's decision renames `c_f → daryaft_az_anbar`, `c_e → mojudi_avval_shab`: `validate_unit` returns `decisions[<n>] S-…: data.inputs[0]: key mojudi_avval_shab is bound through ref_1 to column daryaft_az_anbar` (and the same for inputs[1]); the correct assignment returns `[]`; an input key that is no field key of that record is not judged.
- [ ] **Step 2 (GREEN):** implement both; the check resolves the renamed keys the way `_rename_fields`/step 1b do (the record decision may sit in another unit — when its renames are not in this document, use the skeleton's provisional keys only and skip when unresolvable).
- [ ] **Step 3:** scoped tests; commit `feat(facts): a parameter-bound input is named for the column it reads`.

### Task 4: The card lists unit symbols and item-keyed cells (spec §3.3)

**Files:** `engine/facts_plan/build.py` (`shape_section`, `shape_card`, `render_input`); `engine/facts_plan/assemble.py` (`_digest_text`); tests `engine/tests/test_facts_plan_cards.py`, `test_facts_plan_units.py` (the mini-estate input contains the symbols).

- [ ] **Step 1 (RED):** `shape_section(["g", "kg", "pcs"])` contains a section «واحدهای مجاز» with the three as code spans; the record section contains the sentence that a `refItems` column's cells are minted item keys and a column of names is `string`; the rule section says `per` names an item key. The mini-estate build test asserts the run's symbols appear in every `input.md`.
- [ ] **Step 2 (GREEN):** signature `shape_section(symbols=())`; both callers pass `skeleton["unit_symbols"]`; `refresh_inputs` too.
- [ ] **Step 3:** scoped tests (`facts_plan_cards or facts_plan_units or facts_plan_assemble`); commit `feat(facts): the card names the units and the item-keyed cells`.

### Task 5: Intake recursion (spec §3.5, I2)

**Files:** `engine/extract_attachment/__init__.py` (`find_attachments`, cache naming); `engine/facts_plan/build.py` (`_attachment_state`); tests `engine/tests/test_extract_attachment.py` (or the nearest), `engine/tests/test_facts_plan_units.py`, `engine/tests/test_facts_evidence_types.py` (fixture gains one nested form).

- [ ] **Step 1 (RED):** `find_attachments` over `a/x.docx`, `a/forms/y.pdf`, `a/sheets/z.xlsx`, `a/.text/…`, `a/.hidden/w.docx` returns `[x.docx, forms/y.pdf]` (relative, sorted); the cache path for `forms/y.pdf` is `.text/forms__y.pdf.md`; `unread_attachments` lists `forms/q.xyz` by that relative name; `_attachment_state` serves a fresh nested cache and lists a stale nested one; the evidence fixture adds a nested docx form and the evidence test asserts it is read and cited `docx`.
- [ ] **Step 2 (GREEN):** implement; every reader derives the cache from one helper `cache_path(adir, rel) -> Path`.
- [ ] **Step 3:** scoped tests (`extract_attachment or facts_plan_units or evidence_types or facts_plan_report`); commit `feat(intake): attachments in subdirectories are read or named, never skipped`.

### Task 6: The prompts (spec §3.6) — data-repo

**Files:** `.claude/agents/quantify.md` (review mode ~132–148; the unit contract table row for record ~116; the rule paragraph ~129); `.claude/hooks/test_playbook_lint.py` (three verbatim sentences, the way Stage U's are pinned).

- [ ] **Step 1 (RED):** lint tests for the three sentences: review — «A `contradiction` is admissible only on a field the digest lists under its drift flags; two entries you believe disagree on any other field are a `keep` carrying the reason, never a `contradiction`.»; record — «A column whose cells are names is `type: string`; `refItems` is only for cells that are the catalogue's `##` codes or item keys.»; rule — «An input bound through a parameter takes its key and title from the column the parameter resolves to, as printed under the candidate.»
- [ ] **Step 2 (GREEN):** the three edits, each one sentence added, nothing rewritten.
- [ ] **Step 3:** `"<code worktree>/.venv/bin/pytest" "<data worktree>/.claude/hooks" -q`; commit `docs(quantify): contradictions only on flagged fields; names are strings; bound inputs take the column's name`.

### Task 7: The panel resolves a parameter (spec §3.7) — ui

**Files:** `ui/src/facts/cards/RuleCard.tsx` (`InputRow`, ~465–500); `ui/src/facts/cards/RuleCard.test.tsx`.

- [ ] **Step 1 (RED):** three tests: an input `from: {param: "ref_1"}` whose first binding maps `ref_1 → {ref: "F-00149", field: "daryaft_az_anbar"}` renders the record's title and the field's title (the bundle already resolves `{ref, field}` through `refTitle`); `ref_1 → 75` renders `ref_1 = 75`; an unmapped parameter renders the raw name.
- [ ] **Step 2 (GREEN):** implement in `InputRow` using `bundle.entry.data.applies_to[0].params`.
- [ ] **Step 3:** `npm --prefix ui run test -- RuleCard`; `npx --prefix ui tsc --noEmit -p ui/tsconfig.app.json`; commit `feat(ui): a bound input names the column it reads`.

### Task 8: The runbook (spec §3.8, problems 10–12) — docs

**Files:** `docs/runbooks/07-facts.md` (§12, before «### The bind mount and host-side git»); `docs/decisions/0017-facts-pipeline-v3.md` (one line in the addendum section); `docs/superpowers/specs/2026-09-06-quantitative-facts-v3-design.md` §2.3 (one «Amended 2026-09-08» sentence: the index skips tombstones).

- [ ] **Step 1:** add «### Running the playbook headless» with the recipe (`docker exec -d -w /data -e DATA_ROOT=/data -e SCHEMA_DIR=/opt/schemas -e CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 <container> sh -c 'claude -p "/quantify cooking" --model "claude-opus-5[1m]" --allowedTools Read,Write,Edit,Bash,Glob,Grep,Task --disallowedTools AskUserQuestion,ExitPlanMode,EnterPlanMode --max-turns 200 --output-format stream-json --verbose </dev/null >/tmp/acc/turn-1.jsonl 2>/tmp/acc/turn-1.err; echo $? >/tmp/acc/turn-1.exit'`), the three rules (no permission mode; output inside the container; a fresh session after any change to a run's files, `--continue` only to answer the coordinator's own question), and the `.claude.json` note.
- [ ] **Step 2:** commit `docs(facts): running the playbook headless`.

### Task 9: Merge, rebuild, reset (spec §5) — operational, by the controller

- [ ] Merge `facts-v3-gate` into code-repo main (`git merge --no-ff`), reinstall the engine, build the UI, rebuild the three images; merge the data-repo branch into its main.
- [ ] Reset: bundle the data-repo (`git bundle create <backups>/data-repo-before-reset-<stamp>.bundle --all`) to `../../backups/` (outside both repos); `git reset --hard` to the commit before the run's Stage 6 commit; then merge the data-repo branch; verify `facts/*.json` equal the seed (`F-00001` only, id sequence `{"fact": 1}`), `runs/facts/` absent, the photos and sidecars under `departments/cooking/attachments` still present.
- [ ] `docker compose … up -d --force-recreate control-bot ui-backend upload-bot`; verify the container's data-repo HEAD, index inode and `facts-plan build --help`; smoke: `facts-plan status` on no run exits with the no-run line.
- [ ] Hand the owner the summary and the exact pre-run state.
