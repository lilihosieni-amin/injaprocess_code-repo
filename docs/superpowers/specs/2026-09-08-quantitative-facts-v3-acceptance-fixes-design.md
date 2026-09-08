# Quantitative facts v3 — acceptance-run fixes (addendum v3.5)

Addendum to `2026-09-06-quantitative-facts-v3-design.md` (v3.3) and
`2026-09-07-quantitative-facts-v3-gate-design.md` (v3.4). Status: approved by the owner on
2026-09-08 ("fix all 12 problems, then delete all fact data; I want to start the bot from zero").

## 1. What the acceptance run showed

The first headless run under v3.4 (`runs/facts/cooking/20260907-111125`, 2026-09-07) rebuilt the
store: 217 entries, zero per-entry refusals at Stage V (I1 held). It also showed twelve problems.
Nine are engine, prompt or panel defects; three are operational. This addendum fixes all twelve
and the store is reset afterwards so the owner's next run is a first run.

| # | problem | where |
|---|---|---|
| 1 | the reviewer's document was discarded because its addresses carried no `scope` | engine (fixed 5be6ed3, unmerged) |
| 2 | tombstoned processes are offered to units as citation targets and cited into the store | engine |
| 3 | a parameter-bound rule input is named by position, not by the column its parameter resolves to | engine + prompt |
| 4 | the shape card does not list the declared unit symbols | engine |
| 5 | a `{value, inferred}` wrapper on a `new[]` entry's leaf is refused at the gate | engine |
| 6 | the card and prompt do not say that `per` and `refItems` cells are minted item keys; a column of names was typed `refItems` | engine + prompt |
| 7 | the reviewer writes `contradiction` on fields the digest never flagged, twice | prompt |
| 8 | a file in a subdirectory of `attachments/` is neither read nor listed as unread | engine |
| 9 | the panel prints a raw parameter name (`ref_1`) as an input's source | ui |
| 10 | `--permission-mode bypassPermissions` is refused as root in the container | runbook |
| 11 | resuming a session after touching a run's files must be a fresh session | runbook |
| 12 | the container's `/root/.claude.json` is not on the credentials volume | runbook |

## 2. Invariants

- **I1** stands: whatever `validate facts-unit` accepts, `assemble` + `validate facts-delta --store
  --run` cannot refuse for a per-entry reason. Every new check below runs at both gates through
  `_contract_problems`, or at the unit gate and in `preconditions` from one shared function.
- **I2** stands and widens: every plain file under `attachments/` and its subdirectories, except
  `sheets/`, `.text/` and dot-directories, is either read (an extension in `CONVERTERS`, cache
  fresh) or listed as unread — never silently skipped.
- **I3 (new): a tombstoned process is never read as content.** The process index a unit is shown,
  the citation check, the store gate and the audit all treat a file with `tombstoned: true` as
  absent. Only the id allocator (to never reuse an id) and the supersession flow (to write the
  tombstone) open it.

## 3. Design

### 3.1 Tombstones (problem 2, I3)

`facts_plan.build.process_index` skips a document whose `tombstoned` is true. Because the unit gate
checks `processes[]` citations against that index, a citation to a tombstoned process is refused
with the existing line (`node … is in no process of <department>`). The materialised gate and
`merge_facts.preconditions` additionally refuse a `source[]` member of type `process` whose file is
tombstoned or missing, with `<label>: source[<n>]: process <id> is tombstoned` — one function
`merge_facts.preconditions.process_source_problems(root, entry) -> list[str]` used by both. The
existing audit finding stays as the net for a store written before this addendum. No repair is run:
the store is reset (§5).

### 3.2 Parameter-bound inputs (problem 3)

`_render_candidate` prints, for a rule candidate, one line per parameter key with what it resolves
to in the candidate's first binding: a number as `ref: 5`; a `{ref, field}` as the record's label,
the column letter and the column's header title, e.g.
`ref_1 → «گزارش مصرف و انحراف لاین پیتزا» ستون f «مقدار دریافت از انبار»`. The unit prompt says an
input bound through a parameter takes its key and title from that column.

The gate refuses the swap it can see: for a rule input whose `from` is `{param}`, when the first
binding maps that parameter to `{ref, field}` and the field resolves (after the owning record's
renames) to a key `k`, and the input's own key is a *different* field key of the same record, the
line is `<label>: data.inputs[<n>]: key <input key> is bound through <param> to column <k>`. An
input key that is no field key of that record is not judged (it may be the unit's own name).

### 3.3 The card (problems 4, 6)

`shape_section(symbols)` takes the run's `unit_symbols` and renders a section «واحدهای مجاز»
listing them as code spans; `render_input` and `_digest_text` pass `skeleton["unit_symbols"]`.
The record and rule sections gain one sentence each, in Persian: a rule output's `per` and a
`refItems` column's cells are minted item keys (the catalogue's `##` codes or an item's key); a
column whose cells are names is `type: string`. The card test asserts the symbols and the two
sentences.

### 3.4 Hedge wrappers on `new[]` (problem 5)

`assemble._pseudo` carries a `new[]` entry's `data` as the pseudo decision's `data` rather than as
the candidate's mechanical payload, so `_entry`'s `_unwrap` strips `{value, inferred}` wrappers on
every leaf and writes `field_status`, exactly as it does for a decision. A `new[]` paper record with
`filled_by: {"value": "…", "inferred": true}` passes the gate, and its delta entry carries
`field_status["data/filled_by"] == "inferred"`.

### 3.5 Intake recursion (problem 8)

`extract_attachment.find_attachments(adir)` walks subdirectories except `sheets`, `.text` and any
dot-directory, and returns files sorted by their path relative to `adir`. A nested file's cache name
is its relative path with `/` replaced by `__` (so `forms/tahvil.docx` caches as
`.text/forms__tahvil.txt`); `extract-attachment`, `_attachment_state` and `unread_attachments` all
derive the cache from `find_attachments`, so they cannot disagree. The unread block names the file
by its relative path, which is the owner's own name for it.

### 3.6 Prompts (problems 3, 6, 7)

`.claude/agents/quantify.md`: review mode says a `contradiction` is admissible only on a field the
digest lists under its drift flags, and that two entries the reviewer believes disagree on an
unflagged field are written as a `keep` carrying the reason, never as a `contradiction`; the unit
contract says a column of names is `string` and `refItems` is only for cells that are catalogue
codes or item keys; the rule paragraph says a parameter-bound input takes its key and title from
the column the parameter resolves to, as printed in the input. The playbook lint pins the three
sentences.

### 3.7 The panel (problem 9)

`RuleCard.InputRow` resolves `from: {param}` through the entry's first binding: a `{ref, field}`
value renders as the referenced record's title and the field's title (the same `refTitle` path the
card already uses for a direct `{ref, field}`); a number renders as `<param> = <number>`; an
unresolvable parameter keeps the raw name. One test per case.

### 3.8 The runbook (problems 10–12)

`docs/runbooks/07-facts.md` §12 gains «Running the playbook headless»: the exact recipe (no
permission mode — the bot passes only the allowed and disallowed tool lists; `bypassPermissions` is
refused as root), output written inside the container, a fresh session after any change to a run's
files (`--continue` resumes the coordinator's stale context), and the `.claude.json` note.

## 4. What is not changed

The review's caps, the two-attempt cap, the per-unit `source[]`, the audit's five closing items.

## 5. Reset

After the fixes are merged and the images rebuilt, the data-repo is reset to the state before the
2026-09-07 run's Stage 6 commit: the store back to its seed (`F-00001`, id sequence at 1), no
`runs/facts/`, the run commit dropped from the unpushed history, a bundle kept outside the repo as
the only undo. The owner's next `/quantify cooking` is a first run.
