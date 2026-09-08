# Quantitative facts v3 — generality (addendum v3.6)

Addendum to v3.3, v3.4 (the gate) and v3.5 (the acceptance fixes). Status: the owner's
instruction of 2026-09-08 — "the system shouldn't be trained for one specific set of data and
one specific pattern; when a real user adds data later it must not crash" — followed by "fix all
them" for the three items below.

## 1. Why

Every run until 2026-09-08 was cooking's. The pre-flight over the other eight departments found
that two could not plan at all (the twin rule, since derived), and a reading of the planner found
the estate's own conventions written into the code: two branch names, the `##`/`#` item-code
namespaces and their key prefixes, `Column N` placeholder headers, the Persian month names, the
`Table_` prefix. A new estate would silently get fewer candidates, not an error. And the planner
and the assembly still hold nine places where one input stops the whole run.

## 2. Invariants

- **I1, I2, I3** stand (v3.4, v3.5).
- **I4 (new): the engine's own candidates pass the engine's own gate**, for any estate the
  dumper can read — `facts-plan preflight` reports `engine_refused: 0`. Tested on generated
  estates, not only on the fixture.
- **I5 (new): a run stops only when nothing can be assembled.** Every other refusal names one
  entry or one candidate, holds it back, and the rest lands. The planner's and the assembly's
  stops are enumerated in the runbook, each classified.
- **I6 (new): the estate's conventions are data.** They live in the manifest under
  `conventions`, are written with today's values by `dump-workbook --init-manifest` when absent,
  and no engine module carries a branch name, a code namespace, a placeholder pattern, a month
  name or a table prefix as a literal used for reading the estate.

## 3. Design

### 3.1 Conventions in the manifest (I6)

`attachments/sheets/manifest.json` gains one object:

```json
"conventions": {
  "branch_tokens": ["چاله باغ", "ناهارخوران", "ناهار خوران", "chalebagh", "chale bagh",
                    "naharkhoran", "nahar khoran"],
  "code_namespaces": {"##": "ing", "#": "food"},
  "placeholder_header": "^Column [0-9]+$",
  "month_names": ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
                  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"],
  "table_prefix": "Table_"
}
```

One reader, `merge_facts.conventions.load(root) -> Conventions`, returns these with the defaults
above for any member absent, so an existing manifest keeps working unchanged. The
`branch_tokens` default is derived from `manifest.branches` (each code and name, with and without
the space and the ZWNJ) plus the two spellings above, so a new estate that declares its branches
needs no token list. `dump-workbook --init-manifest` writes the object with the effective values
into a manifest that lacks it (idempotent; a confirmed manifest's `conventions` are never
rewritten). The manifest schema admits it. Consumers: `facts_plan.build` (`_BRANCH_TOKENS`,
`_BRANCH_TOKEN`, `_CODE_IN_TEXT`, `_PLACEHOLDER`, `_MONTHS`, `code_key`, `_TABLE`'s prefix,
`_code_slug`), `dump_workbook` (`_MONTHS`, `_BRANCH_CODES`), `merge_facts.content`
(`_CODE_IN_CELL`). The card and the unit prompt keep saying `##`/`#` only through the loaded
namespaces (the card prints the namespaces it was given).

### 3.2 Every stop, classified (I5)

| where | today | after |
|---|---|---|
| `build.split_unit` — a unit over budget with no axis left | exit 2 | the unit's largest candidates are set aside, largest first, until the unit fits; each becomes a skeleton issue `oversized` (`run_only`) naming the candidate, listed in `gate-b.md`/`report.md` under «کنار گذاشته شد: بزرگ‌تر از یک واحد»; the run proceeds |
| `build.plan_units` — a candidate in two units or in none | exit 2 | unchanged: an engine invariant, never an input's fault |
| `cli.check_rebuild` — units already done, no `--rebuild` | exit 2 | unchanged: protects finished work; the playbook resumes through `status` |
| `assemble._outputs` — a unit's latest output invalid, attempts left | exit 2 | unchanged: the run is not ready; Stage U re-dispatches |
| `assemble._target_of` — `merge_into` cycle | exit 2 | every candidate on the cycle is held back to `undecided[]` with `refused: ["merge_into cycle …"]`; the rest lands |
| `assemble._build_entries` — `merge_into` a target no unit kept | exit 2 | the merging candidate is held back with `waits_for` the target; the rest lands |
| `assemble._resolve_refs` — an `F-` ref in no store entry | exit 2 | the entry is held back with `refused: ["ref F-… is in no store entry"]`; the rest lands |
| `assemble.assemble` — step 8 refusals | held back (v3.5) | unchanged; a review's own rewrite still refuses the run |
| `assemble.assemble` — nothing assembled | exit 2 | unchanged: the only true stop, with every held-back reason printed |

`undecided[]` members gain an optional `reason` (`oversized`, `cycle`, `target_dropped`,
`unknown_ref`, `refused`, `waits`) so the report can group them; the Persian lines are fixed in
`assemble.report`.

### 3.3 Generated estates (I4, I5)

`engine/tests/fixtures/facts_plan/synth.py` — `synth_estate(root, seed, *, departments=1,
workbooks=3, conventions=None)` writes a manifest, dumps, formulas, rows, attachments and
transcripts from a seeded `random.Random`: header rows at 1–6, tabs with and without codes,
`Column N` placeholders, empty tabs, hidden tabs, Latin and Persian tab names, one to three
branches, mirror tabs, formulas with `#N/A`/`#REF!`, reference tabs with and without codes, a
third-branch twin, attachments with readable, unreadable and nested files, a transcript of 0–60
lines. `engine/tests/test_facts_plan_generality.py` runs 24 seeds: `build` either returns or
exits 2 with a `facts-plan:` line (any other exception fails the test); `preflight` reports
`engine_refused == 0`; the bare-keep outputs assemble without raising; the delta validates against
the delta schema and `simulate` reports nothing per entry. The whole test stays under 90 s.

## 4. Docs

Runbook §10 lists the stops table (§3.2) and the `conventions` object; the manifest README (or
`schemas/README.md`) documents the object; ADR 0017 gains one line. The data-repo's manifest
gets `conventions` written by `dump-workbook --init-manifest` in one commit.
