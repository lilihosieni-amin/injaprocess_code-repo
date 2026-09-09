# The quantitative-facts system, end to end — a walkthrough for newcomers

*Written 2026-09-09 against code-repo `911da39` and data-repo `9a1957c` (v3.7). When this
document and the code disagree, the code is right; tell whoever maintains this file.*

This document explains everything that happens from the moment the owner sends a message to the
Telegram bot until the result is finished and visible in the panel. It covers the bot, the
"coordinator" session inside it, the sub-agents it dispatches, every engine command the code runs,
every file that gets written, every rule that gets enforced, and every table and schema in the
store. It is written for someone on their first week. Every technical term is explained in plain
words the first time it appears, and there is a glossary at the end.

---

## 0. The one-paragraph version

The restaurant keeps its numbers in three places: Google Sheets workbooks (recipes, nightly stock
counts, reports), paper forms, and things people say in meetings. The **quantitative-facts
system** reads those three sources and turns them into a small, checked, versioned database of
*definitions* — "a portion of roast beef is 60 g", "the nightly stock form has these columns",
"waste is computed as start plus received minus end". That database is called the **facts store**.
The owner drives the whole thing from Telegram: one command runs a full read of a department; one
chat message changes a single fact. A web panel shows the result, with a tick the reviewer clicks
to say "I have read this and it is right". Nothing is ever deleted; every change is a commit in
git; and the artificial-intelligence parts never write to the store directly — a deterministic
program (the **engine**) does, after checking everything.

---

## 1. The cast

Before the journeys, meet everyone involved. Keep this list at hand.

| Who | What it is | Where it runs |
|---|---|---|
| **The owner** | The one person allowed to talk to the bots. Speaks Persian. Never sees ids, paths or commands. | Telegram |
| **upload-bot** (Bot 1) | A small Python program. The *only* way files and voice recordings enter the system. | Docker container `upload-bot` |
| **control-bot** (Bot 2) | Not our code: the open-source `claude-code-telegram` (pinned v1.6.0) plus six small patches. It turns a Telegram chat into a **Claude Code session** whose working directory is the data-repo. | Docker container `control-bot` |
| **The coordinator** | The Claude Code session itself — the model following a *playbook* (a Markdown file of instructions). It dispatches sub-agents, runs engine commands, relays engine-written text to the owner. It writes no fact content. | inside control-bot |
| **The quantify agent** | A sub-agent (a separate, fresh model call with its own instructions) that makes the *judgement* decisions: what a column means, what to call it, whether a thing is a fact at all. It reads exactly two files and writes exactly one. | dispatched by the coordinator with the `Task` tool |
| **The engine** | Nine command-line programs written in Python (`facts-plan`, `merge`, `validate`, `dump-workbook`, `extract-attachment`, `transcribe`, `allocate-id`, plus two for the process side). Deterministic: same input, same output, every time. **Only the engine writes the store.** | installed in the control-bot and ui-backend images |
| **The guard hook** | A tiny Python script that Claude Code runs *before* every file write or shell command in the session. It blocks anything that would bypass the engine. | inside control-bot |
| **The panel** | A web application: a FastAPI backend (`ui-backend`) and a React frontend (`ui`). Read-mostly; it shows the store and records who confirmed what. | Docker container `ui-backend` |
| **git** | The data-repo is a git repository. Every run and every edit ends with a commit. | on disk |

Two words you will see constantly:

- **data-repo** — the git repository that holds the restaurant's data: transcripts, attachments,
  spreadsheet dumps, the facts store, run records, and the bot's own instructions (`.claude/`).
  Every container mounts it at `/data`.
- **code-repo** — the repository that holds the programs: the engine, the bots' configuration,
  the panel, the schemas, and this document. The rule "code and data are separate" is invariant
  INV-2 (an *invariant* is a rule that must always hold, no exceptions).

And one architectural rule that explains a lot of the design: **components talk only through the
filesystem.** The bot never calls the panel over the network; the panel never calls the bot. They
share the data-repo directory, and that is all.

---

## 2. Where things live

### 2.1 The data-repo

```
data-repo/
  CLAUDE.md                     the bot session's standing orders (Persian-only, the invariants, hard rules)
  .claude/
    settings.json               registers the guard hook
    hooks/guard.py              the guard (and its tests)
    skills/quantify/SKILL.md    the /quantify playbook
    skills/edit-fact/SKILL.md   the /edit-fact playbook
    agents/quantify.md          the quantify agent's instructions (its "system prompt")
  departments/
    registry.json               the nine departments (code + Persian name)
    <dept>/attachments/         files the owner uploaded for that department (.docx, .pdf, photos)
    <dept>/attachments/.text/   cached plain-text conversions of those files (+ .sha256 sidecars)
    <dept>/processes/*.json     the process documents (the sibling "process" feature, not covered here)
  meetings/
    audio/                      voice recordings (git-ignored, large)
    transcripts/raw/<name>.txt  machine transcript, untouched
    transcripts/<name>.txt      the approved transcript (the source of record)
  attachments/sheets/
    manifest.json               the list of workbooks and what the owner said about each
    <dir>/<file>.xlsx           the exported Google Sheets workbooks (server-local, git-ignored)
    <dir>/<file>.structure.md   arrives with the export; only its spreadsheetId line is read
    .dump/<spreadsheetId>/      what dump-workbook extracted from each workbook
  facts/                        THE STORE (section 6)
  runs/facts/<dept>/<stamp>/    one directory per run or per edit (section 8)
```

### 2.2 The code-repo

```
code-repo/
  engine/                       the nine CLIs; the facts packages are facts_plan/ and merge_facts/
  schemas/*.schema.json         the frozen data contracts (section 7)
  ui-backend/, ui/              the panel
  control-bot/, upload-bot/     bot config and Bot 1's code
  deploy/                       docker-compose files and Dockerfiles
  docs/runbooks/07-facts.md     the operator's runbook for this feature
  docs/superpowers/specs/       the design documents (v2, v3, v3.4, v3.5, v3.6, v3.7)
```

---

## 3. How a Telegram message becomes a running program

This section is short but it is the foundation of everything after it.

1. The owner types in Telegram. `control-bot` checks the sender's numeric Telegram id against
   `ALLOWED_USERS` — one id. Anyone else gets nothing back, not even an error.
2. The bot hands the text to **Claude Code** (Anthropic's command-line agent) running with its
   working directory set to the data-repo (`APPROVED_DIRECTORY`). Claude Code reads the data-repo's
   `CLAUDE.md` and its `.claude/` folder, so it knows the playbooks and the agent definitions. A
   patch (0003) makes sure the standard Claude Code behaviour is *kept* and `CLAUDE.md` is
   *appended* to it, rather than replacing it.
3. The session may use exactly these tools: `Read, Write, Edit, Bash, Glob, Grep, Task`. `Task` is
   how it dispatches a sub-agent. Interactive prompt tools are disabled because Telegram cannot
   render them; instead the playbook tells the model to *end its turn* when it needs an answer.
4. **One model turn per Telegram message.** When the model stops talking, the bot waits for the
   next message. This is why the playbooks are obsessive about *where* a turn may end: only at
   the owner's checkpoints, or at a "yield" (explained later).
5. Before every file write and every shell command, Claude Code runs the **guard hook**
   (`guard.py`). It reads the intended action and exits 0 (allow) or 2 (block, with a reason the
   model sees). It blocks: writing anything under `facts/` or `departments/**/processes/*.json`
   except through the engine; writing under `.claude/` or to `CLAUDE.md`; writing outside the
   repo; shell tricks that would do the same (`tee`, `sed -i`, `>` redirects into those paths);
   running Python that imports the engine's internal modules or a script under `runs/`; and the two
   `order` verbs that curate process order. The engine's CLIs are the *only* way the session may
   touch the store.
6. The engine commands the session runs need two environment variables: `DATA_ROOT` (where the
   data-repo is — `/data` in the container) and `SCHEMA_DIR` (where the schemas are —
   `/opt/schemas`).
7. Budget and safety settings that matter: `CLAUDE_MAX_TURNS=300` (a full department read needs
   100–150 model turns); `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` (stops Claude Code from
   "backgrounding" a slow sub-agent, which used to make runs die mid-way); a 30-minute shell
   timeout; and patch 0004, which turns off token streaming because streaming made parallel
   sub-agents get dropped.

Everything the owner sees is Persian. Ids, file paths, column letters, commands and department
codes never appear in a message; the playbook calls a unit «بخش از داده‌ها» ("a part of the data")
and a workbook «فایل» by its title. Only three English things survive: an attachment's own file
name, an entry id shown in the panel, and the words csv / Excel / sheet.

---

## 4. Journey 1 — a full department read: `/quantify cooking`

This is the big one. The owner sends «quantify cooking» (as plain text; the bot may intercept a
literal slash). The coordinator opens `.claude/skills/quantify/SKILL.md` and follows it stage by
stage. The stage letters below are the playbook's own.

A **run** is one execution of this journey. Every run gets a directory
`runs/facts/cooking/<stamp>/` where `<stamp>` is the UTC time it started (`20260908-151433`). All of
the run's working files live there, and the directory is committed to git at the end, so a run is
fully auditable afterwards.

### Stage 0 — Resume

The coordinator's first action is always the same command:

```
facts-plan status --run runs/facts/cooking/<stamp> --new-turn
```

`status` looks at the files on disk and prints one line per unit (`id · type · state · attempts`)
plus which stage to enter, whether the plan is stale, how long this turn has been running, and
whether to **yield**. It also writes `turn.json` (one timestamp) so the yield clock starts.

For a *fresh* run the coordinator first creates the run directory and writes `meta.json` — the
run's identity card (schema `facts-run-meta`): department, `origin: "pipeline"`, who started it,
when, and empty lists to be filled later. `finished_at: null` means "this run can be resumed".

Why this matters: the bot runs one turn per message, and a department read takes hours. If the
turn ends (a checkpoint, a yield, a crash), the owner's next message re-enters Stage 0, `status`
reads the disk, and the run continues from the first unfinished unit. Nothing is lost; nothing is
kept in memory.

### Stage M — the workbook checkpoint (Gate M)

```
dump-workbook --init-manifest
```

`dump-workbook` opens every `.xlsx` under `attachments/sheets/`. An `.xlsx` is really a zip file of
XML, and the program reads it with the standard library only. For each workbook it writes a
**dump** into `attachments/sheets/.dump/<spreadsheetId>/`:

| dump file | what it holds |
|---|---|
| `sheets.json` | every tab: name, id, hidden flag, size, the first nine rows (the "head"), which row is the header, the item codes printed in the head, the row labels down the side of small tables |
| `formulas.tsv` | one line per formula group: tab, range, the formula text, how many cells share it, the cached result, any error |
| `names.tsv` | the workbook's named ranges |
| `validations.tsv` | drop-down lists (data validation) per range |
| `cf.tsv` | conditional-formatting rules with their thresholds |
| `comments.tsv` | cell comments, with the author replaced by a *role* or `unknown` — names never leave the module |
| `rows.tsv` | the full cell contents of **reference tabs only** (recipe tables, the ids tab) |
| `meta.json` | the file's hash and export date |

Note the deliberate omission: **ordinary cell values are not dumped.** A nightly stock count is an
*observation*, not a *definition* (rule QF-1), and the system only stores definitions. The
exception is a *reference tab* — a table that *is* a definition, such as the bill of materials for
a pizza — whose cells are the fact.

`--init-manifest` then reads or creates `attachments/sheets/manifest.json`: one row per workbook
with mechanical columns (id, directory, file, scripts, a short name) and three **judgement
columns** the owner must answer: which departments the workbook belongs to, which branch it is for,
and which tabs are reference tables. The program proposes answers where it can (a branch from the
folder name; reference tabs from "has item codes in the header and computes nothing"). A row with
an unanswered column is marked `unresolved`, and `confirmed` is derived: true only when nothing is
unresolved. The `conventions` block (which characters mark an item code, what a placeholder header
looks like, the month names, the `Table_` prefix) is written once and never rewritten.

If any row is unresolved, the coordinator dispatches the **quantify agent in `manifest` mode**,
which turns the proposals into Persian choices with a one-line reason each and writes
`manifest-proposal.json`. Then **Gate M**: the coordinator lists each unresolved workbook by title
with its choices and *ends the turn*. The owner corrects or confirms. On confirmation the
coordinator writes the answers into the manifest and validates it. A row the owner leaves
unresolved is skipped by every later stage and named once in the report — Gate M never blocks a
run.

In the current estate all 28 rows are already confirmed, so this gate is skipped.

### "Resolve the set" and Gate A — the input checkpoint

The coordinator gathers, without asking anything yet: every manifest row that includes this
department (or names none, meaning universal), every file under
`departments/cooking/attachments/`, the cached text conversions already present, and the candidate
recordings (`meetings/transcripts/cooking-*.txt` plus any audio without a transcript). Then
**Gate A**: it presents the workbooks, the attachments and the recordings by *date* (never by file
name), asks «کدام جلسه‌ها را وارد کنم؟» ("which meetings should I include?"), and ends the turn. The
owner names dates or «هیچ‌کدام» ("none"). Only the recording choice is editable here.

### Stage 1 — Transcribe

For each chosen recording: if `meetings/transcripts/raw/<name>.txt` exists (upload-bot makes it
automatically when the voice arrives, see section 9), it is read; otherwise `transcribe <name>`
runs (audio → mono Opus → 13-minute chunks with overlap → the Gemini model on Vertex AI → text).
The coordinator strips any preamble, runs a verbatim sanity check, and writes the approved text to
`meetings/transcripts/<name>.txt`. The raw file stays as the audit trail.

### Stage 2 — Prepare

```
dump-workbook --manifest
extract-attachment cooking
extract-attachment --path attachments/sheets
```

`--manifest` re-dumps every confirmed workbook (it refuses, exit 2, if a workbook has no manifest
row; it warns and skips an unresolved row). `extract-attachment` converts each attachment to text
in `.text/`: `.docx` through python-docx; `.pdf` and images through the Vertex vision model with a
fixed eight-point prompt that ends with a mandatory `handwriting: yes|no` line (that line is how a
filled-in form is told apart from a blank master). A `.sha256` sidecar beside each output means a
file is reconverted only when its bytes changed. Files with no converter are named on stderr and the
command exits 3 — *advisory*, the run continues; exit 2 is a real failure and stops it.

### Stage P — Plan

```
facts-plan build cooking --run <run_dir> --recordings cooking-1405-05-26,cooking-1405-06-10
```

This is the engine's big deterministic step. It reads the manifest, every dump, the `.gs` scripts
the manifest names, the chosen transcripts, the cached attachment text, and two small slices of the
existing store (the index, and the units record's symbols). It writes nothing owner-facing. What it
produces:

**Candidates** — everything mechanical that *might* become a fact, with a provisional id like
`S-rec-3f9a…` (`S-` for skeleton). Four kinds of candidate:

- **Record templates.** Every tab that can carry a record (not empty, has a header row, not the
  ids tab, not a mirror tab, more than one cell). Tabs with the same folded name and the same item
  codes across two branches' workbooks are grouped into *one* template with several **instances**
  (one per physical tab, keyed `<short>__s<sheetId>`). Each template gets its fields: one per header
  cell, matched across instances by header text, with a provisional key `c_<column letter>`, a
  guessed type (`number` if every sampled cell parses), and enum constraints from the drop-down
  lists. A reference tab also gets its rows, keyed by item code.
- **Items.** One per distinct item code (`#61`, `##1`) found in headers, row labels and reference
  tables, with the labels the estate uses for it.
- **Rule columns.** One per *output header* across the department's tabs. The engine normalises
  every formula in that column: strips whitespace, renames `LET` locals, turns cell references
  into `@` slots, table names into `$T` slots, numbers into `#` slots. Formulas with the same
  shape are one **variant**; each cell range the variant occupies is a **binding**
  (`applies_to[]`, keyed `<instance>__<column>__r<first row>`) carrying its own **parameters**
  (`tolerancePerFoodGr: 5`, `ref_1: {ref, field}`). This is the trick that turns sixty copies of a
  formula into *one* rule with sixty bindings.
- **Script rules.** A function in a `.gs` script that nothing calls and that contains arithmetic
  or a condition.

Alongside the candidates: **import edges** (a "mirror tab" that only does
`IMPORT_FROM_SHEET(...)` is not a record; it is an edge from the source tab to every tab that reads
the mirror), a **function library** (`functions.md`, one section per distinct function body), and
**issues** the engine found in the files (`broken_formula`, `column_shift`, `unused_mirror`,
`unread_attachment`, and so on — the full list is in section 6.3).

**Units.** The candidates are packed into **units** — parcels of work small enough for one model
call: at most 20 000 estimated input tokens and 20 000 output tokens, 1 800 lines of at most 1 900
characters. Grouping is fixed, not clever: one unit per workbook group (`u-wb-<short>`), one per
transcript chunk (`u-tr-<recording>-l<first line>`), one for the items (`u-items-…`), and the
attachments appended to the last transcript unit (or their own `u-attachments`). A unit that does
not fit is split along its natural axis (a workbook by tab, items by code range, a transcript by
line range). A unit that still cannot fit has its largest candidates **set aside** as `oversized`
issues rather than stopping the run — the owner is told which table was too big.

**The unit's input.** Each unit gets one Markdown file, `units/<u>/input.md`, and that file is
*everything* the agent is allowed to know. In order: the candidates (a rule prints its output
header, its variants, its bindings and what each parameter of the first binding reads); the
transcript text; the library functions this unit's formulas call; the context (cell comments,
business-threshold formats, the «نیازمندیها و مشکلات» tab); one-line field tables of other
templates this unit's bindings point at; a *reuse slice* (existing store entries that look
related, so the unit reuses keys instead of inventing new ones); forty ranked process nodes it may
cite; and then three **cards**:

- the **expression card** — the small formula language (`if then else and or not min max sum abs
  round over of`, every other identifier must be a declared input, output or called rule, the one
  aggregate form `sum over <input> of (…)`, the key grammar);
- the **shape section** — generated *from the delta schema on disk*: per kind the closed list of
  allowed keys with required ones starred, every enum's values, the location shape per medium,
  four worked examples (a paper form, a measurement, a parameterised rule, a decision table), the
  rule that technical names never appear in prose, and the allowed unit symbols;
- the **style card** — how titles and statements must read (Persian, no A1 addresses, no tab or
  file names, no formula text, no pipeline jargon, no Latin word of four letters or more except
  csv/Excel/sheet and unit symbols, at most eight quoted words).

Because the shape section is generated from the schema, the contract the agent is *shown* and the
contract it is *held to* cannot drift apart.

`build` writes `plan.json` (unit ids, their inputs and candidates, and the SHA-256 hashes of every
file it read — so `status` can report `plan_stale` if a dump changes), `skeleton.json` (the only
place the mechanical payload lives), `functions.md`, and the `input.md` files. It refuses to
overwrite a plan whose units have already produced output unless `--rebuild` is given, because
unit ids depend on the size estimate and renumbering would orphan finished work.

### Stage U — the units (bounded parallel, four at a time)

The coordinator now dispatches the **quantify agent in `unit` mode**, at most four in one message,
waits for all four, validates each, and dispatches the next four. Four is the proven-safe number
for the Telegram bridge (ADR 0011).

Each dispatch names the unit, the attempt number (1 or 2), the input path and the schema path,
and carries the sentence "nothing runs in the background; results arrive as tool results in this
turn" (a hard-won fix for sub-agents that used to wait for a monitor that did not exist).

**What the agent does.** It reads exactly two files — `input.md` and `facts-unit.schema.json` —
and writes exactly one, `units/<u>/out.<attempt>.json`. It never reads a dump, a transcript, the
store, or a process file; if it needs something that is not in its input, the right answer is a
`drop` with `reason_code: insufficient_context`, never a search. For **every** candidate in its
input it writes one decision:

| decision | meaning | what it carries |
|---|---|---|
| `keep` | this is a real fact | the minted `key`, a Persian `title` and `statement`, `aliases`, `branches` (only if the source names one), `processes` (a process node it cites), and `data` — the *judgement* half of the payload |
| `drop` | this is not a fact | a `reason_code`: `not_a_fact`, `date_passthrough`, `cosmetic`, `duplicate`, `has_a_home`, `insufficient_context`, `other` |
| `merge_into` | this is the same thing as that other candidate | the target's id |
| `split` | this one candidate is really two or more different computations | the parts, each taking specific bindings |

It may also add `new[]` entries the planner could not see: a paper form described in a transcript,
a measurement ("the chef weighs the chicken at delivery"), a note (an open question addressed to
some entry). A value the agent *inferred* rather than read is wrapped `{"value": …,
"inferred": true}`; the engine turns that into a `field_status` mark later.

The division of labour is strict (rule QF-46): the engine has already written every location,
instance, column letter, enum constraint, reference row, item code, original formula text and
binding. The agent writes what needs judgement: keys, titles, statements, units nobody wrote down,
the business meaning of a formula in the expression language, the role of a record, whether to keep
or drop. A rule names a record's column by its *provisional* key (`c_h`); the record's own decision
renames that column (`{"from": "c_h", "key": "masraf_elami"}`), and the engine rewrites every edge
through the rename.

**The unit gate.** On return the coordinator runs

```
validate facts-unit runs/…/units/<u>/out.1.json --run <run_dir>
```

This is invariant **I1**: *the unit gate is the store gate.* The validator does not just check the
output's shape. It **materialises** the entries this output would become — the same code path the
assembly uses — and puts them through the *entire* store contract: the delta schema, every
`{ref}` resolving, the row-key rule, unit symbols declared, the twenty-odd content checks (section
10), and the style lint. Anything the store would refuse later is refused *here*, while the unit
still has an attempt to fix it. It also checks the mechanics: the file sits in the directory of the
unit it names; every candidate has exactly one decision; a `field` that starts with `c_` is a
real provisional column; a rule input whose key is another column of the record it reads (the
"swapped input" that once bound «موجودی آغاز شب» to «مقدار دریافت از انبار») is refused; a `unit`
on a non-numeric field is refused; every cited process node is one the unit could see.

A unit whose output fails is re-dispatched **once** with `attempt: 2`, its previous output and the
grouped errors. There is no third attempt: the validator refuses `out.3.json` outright, and
`status` reports the unit `failed`. The run continues without it; its candidates are reported to
the owner as *unexamined*, never silently dropped. A truncated or unparseable file costs no attempt
— `status` deletes it.

**The yield rule.** Between batches the coordinator runs `status`. If it prints `yield: true`
(forty minutes of turn time), the coordinator sends one progress line («۸ از ۲۶ بخش از داده‌ها
بررسی شد؛ برای ادامه «ادامه بده» را بفرستید») and ends the turn. The owner's next message resumes
losslessly at Stage 0. The coordinator never continues past a yield "just to finish one more".

### Stage R — Review

```
facts-plan digest --run <run_dir>
```

`digest` folds every unit's output into entries in memory and writes `review/input.md`: one line
per assembled entry (kind, key, scope, title, statement, and the formula or the columns), the
engine's **flags** (things it noticed across units — a title used twice, two units disagreeing
about a leaf, one tab claimed by two keys, variants that differ only by a wrapper function), the
dropped candidates, and the same shape section. It also writes `review/input.sha256`, a hash of
the digest, so a review written against an older digest is detected — and detected means *redone*:
`assemble --review` refuses a stale review («the digest changed since this review was written»),
and the playbook re-enters this stage rather than dropping it. The ceiling is 400 000 tokens (the
runtime model holds a million; cooking, the largest department, digests to about 29 000). Above it
`digest` writes nothing and exits naming the count — a digest no reviewer can read is a defect that
stops the run, never a run recorded without a review.

Then one dispatch: the **quantify agent in `review` mode**. It reads the whole assembled result
at once — the only place anyone sees the department as a whole — and writes `review/out.json` in
the same `facts-unit` shape, addressing entries by `{kind, key, scope}` (ids do not exist yet). It
may `keep` with corrections (a `data` it carries is merged member by member over the unit's own,
never wholesale), `drop`, `merge_into`, and — only here — raise a `contradiction` on a field the
engine flagged as *drift*, resolving it either as an `account` (open a dispute for the owner) or a
`fix` (correct a demonstrable slip). There is no cap on how many decisions it may write or how
many statements it may rewrite; where to spend its attention — duplicates, contradictions,
cell-reference statements, not polish — is guidance, not a count. A `code` it writes is ignored
rather than refused: the code is the engine's. The same validator gates it, folding the review over
the assembly and linting the result exactly as the assembly will, and a failure is re-dispatched
**once** with the validator's own concrete lines — the reviewer gets the two attempts a unit gets.
What still fails after that is not thrown away: **the review is never dropped whole.** Stage V
applies every decision that passes and holds back the rest one decision at a time, each with its
reason — an address that names no entry or names more than one, a `contradiction` on a field no
drift flag names, a candidate no unit of this run decided, a `keep` that rewrites a table's columns
(the digest shows minted keys, never the column keys the shape needs), or a folded entry the lint
refuses.

### Stage V — Assemble and validate

```
facts-plan assemble --run <run_dir> --review
validate facts-delta <run_dir>/facts-delta.json --store --run <run_dir>
```

`assemble` is deterministic and runs in a fixed order: ascending unit id, ascending candidate id,
ids minted in kind order (item → record → measurement → rule → note).

1. It takes each unit's latest attempt (a unit with an invalid latest attempt *and an attempt
   left* is a stop — the coordinator re-dispatches it and runs `assemble` again; a unit that spent
   both attempts is simply absent).
2. It folds the review, holding back by decision what fails (`review_held`), or records it as
   `absent` when there is none.
3. For every `keep`, it builds the **entry**: the skeleton's mechanical payload plus the unit's
   judgement, the unit's field renames applied (and applied to the reference rows and primary key
   too), `source[]` written from the instances (one `sheet` citation per tab) or from the
   transcript lines or the attachment sidecar (a photographed form is cited as a `photo`, a
   Word file as `docx`), scope from the run's department and the tabs' branches, and every
   non-run-only engine issue attached to the entry it concerns.
4. `merge_into` moves bindings and instances onto the target (a cycle of merges makes every
   member of the cycle *undecided*).
5. **Cross-unit resolution.** Two units producing the same `(kind, key, scope)` become one entry:
   the lowest unit's prose wins; where the two disagree on a scalar, the engine opens two
   **accounts** (a dispute for the owner) if they came from different *kinds* of source, or a
   `unit_drift` flag for the reviewer if from the same kind.
6. **Reference resolution.** Every `{ref: "S-…"}` to a kept entry becomes `{ref: "T-<n>"}` (a
   temporary id); a reference to something dropped or failed is a **hold-back** (`waits`); a
   reference to an `F-` id not in the store is a hold-back (`unknown_ref`). Holding back
   cascades to a fixpoint (anything that points at a held-back entry is held back too), except
   that a `derived` pointer on a record column is severed instead of taking the whole table with
   it.
7. Scopes are attached (an entry with no tabs of its own takes the branches of what it attaches
   to). Notes get their deterministic keys.
8. **The lint.** Every finished entry goes through the same content checks and style lint as at
   the unit gate. An entry that fails is **held back** to `undecided[]` with its reason — the run
   lands the rest (invariant **I5**: one bad input never stops a run). A lint line labelled
   `review: <key>` names a review decision rather than a unit: that decision is held back, the
   review is folded again without it, and the loop repeats until it settles. The only refusal that
   stops the run here is nothing at all being assembled.
9. It writes `facts-delta.json` (the proposed changes, `schema_version 2`, temp ids),
   `assembly.json` (`dropped[]`, `undecided[]` with reasons, which unit each temp id came from,
   the review's status — `applied`, `partial` or `absent` — and `review_held[]`, one row per
   held-back decision with its reason and the title of the entry it addressed), and `gate-b.md`
   (the run's record of what it proposed).

The **six kept stops** — the only places the planner, the digest or the assembly may refuse a
whole run — are pinned by a test: a candidate planned into two units or none; `build` without
`--rebuild` once a unit is done; a unit's latest output invalid with an attempt left; a digest
over the 400 000-token ceiling; a review written against an older digest (Stage R is re-entered);
nothing assembled at all. Everything else is a hold-back with a Persian
reason: «بزرگ‌تر از یک واحد» (too big for a unit), a merge cycle, a dropped target, an unknown
reference, refused by the gate, waiting on a held-back entry, its unit failed — and, on the
review's side, a decision the fold could not apply, named in the report with its own reason.

Then `validate facts-delta … --store --run` performs **the entire apply in memory** on a copy of
the store, with a memory-only id minter, and validates the resulting store against the store
schema. It writes nothing — not even the id counter changes. A delta that passes here is one
`apply` cannot refuse. Because every per-entry rule was already enforced at the unit gate, what
is left here is cross-entry only (twin titles, instance ownership, references between units); if
it names a single entry's field anyway, that is a defect to report, never something to hand-repair.

### No Gate B — the apply follows straight away

Until 2026-09-09 the run stopped here and sent the owner a checkpoint message written by the
engine (`gate-b.md`), waiting for «تأیید» before anything was written. The owner ruled it out: at
the size a department produces (two hundred entries and more) the message was not something a
person could actually judge, and an apply is reversible anyway. So the run now continues into
Stage 5 in the same turn. `gate-b.md` is still written to the run directory as the record of what
the run proposed, but it is never sent. The owner's decisions move to the report: a dispute is
answered there («۱ الف»), and a run the owner rejects is undone with `merge facts revert`.

### Stage 5 — Apply

```
merge facts apply --delta <run_dir>/facts-delta.json --run <run_dir>
```

`apply` is the one moment the store changes. In order:

1. **Refuse a reused run directory.** If `id-map.json` or `facts-before/` already exists, the
   directory has applied a delta; exit 2. (A retry after a *precondition* failure is fine —
   nothing was written.)
2. Validate the delta against `facts-delta.schema.json`; deep-copy every entry (the file the run
   keeps must stay what its author wrote); canonicalise scope (sorted, unique).
3. **Derive keys.** A `refItems` cell that holds a temp id is replaced by the target's key; a
   reference record's row keys are re-derived from its primary key; a measurement's key becomes
   `<item>__<record>__<column>`.
4. **Preconditions** — every one is checked before the first byte is written, and any failure
   prints `precondition failed: …` and exits 2 with the store untouched: no two entries in the
   delta share a natural key or a tab; every key matches the grammar; every department is in the
   registry and every branch in the manifest (QF-33); every unit symbol is declared by the units
   record (QF-40); a new entry is created only in the run's own department or at universal scope
   (QF-43); no creation duplicates an existing open entry's title in the same kind and scope
   (QF-34); a matched entry's key is not changed; one open record per tab; every `{ref}` resolves
   and every `field`/`row` it names is declared by its target (QF-37); every source path names a
   real file inside the repo (QF-5); no source cites a tombstoned process (I3); and the whole
   content pass once more, with the store.
5. **Plan the match.** For each entry, in kind order: find an existing entry by *instance
   identity* first (same spreadsheet and tab), then by *natural key* (`kind, key, scope`). No
   match → `create` (a fresh `F-` id from `allocate-id`, which increments `facts/.id-seq.json`).
   A match → `merge`. A match that the delta says it *supersedes* (or that carries a later
   `valid_from` and would otherwise dispute) → `supersede`: a new entry is created as the successor,
   the old one gets `valid_to` and `superseded_by`. A workbook stub (a placeholder record minted
   earlier for a workbook not yet read) → `adopt`, keeping the stub's id.
6. **The write ladder** (section 10.2) merges each matched pair leaf by leaf. It never overwrites.
7. Every touched entry gets its derived `status` and, if anything changed, a new `updated_at`.
   Every citation gets a `hash` of the file it cites and the run that cited it. Formula bodies
   are moved out of line into `facts/originals/<id>.txt` and the entry carries `original_ref`.
8. **Snapshot.** `facts-before/` gets a copy of the five store files as they were — this is what
   `revert` restores from.
9. **Save.** All five files are validated against `facts.schema.json` *before* any is written;
   then they are written atomically (temp file + rename), `.index.json` is rebuilt, and the chat
   confirmation ledger is pruned (section 5.4).
10. The run directory gets `id-map.json` (temp id → minted id, *minted ids only*), `touched.json`
    (every open entry the run changed), `adopted.json` (stub adoptions), and a copy of the delta.

`apply` prints `created F-…` / `updated F-…` per entry. Re-applying the same material yields only
no-ops and leaves the five files byte-identical — this is what makes re-reading a workbook safe.

### Stage 6 — Finish and commit

The coordinator writes `meta.json`'s final shape (`finished_at`, the recordings, attachments and
workbooks used, `delta`, `merged: true`, `ids_created`, one `{id, type, state, attempts}` per unit),
validates it, runs `facts-plan report --run <run_dir>`, and commits with an allow-list — never
`git add -A`:

```
git add departments runs facts attachments && git commit -m "quantify(cooking): 226 created, 0 updated"
```

### Stage 7 — Report

The coordinator reads `report.md` and sends it verbatim: the open disputes numbered with lettered
options, the unanswered cells per entry, the dropped candidates counted by reason, every engine
issue grouped by kind, the unread/unplaced list, what was held back and why, and
the review's closing block. That block is one line — «بازبینی انجام شد.» — when every decision was
applied; when some were held back it reads «بازبینی انجام شد؛ ۲ تصمیم آن کنار گذاشته شد:» followed
by one line per held decision, «  • «عنوان» — نشانی به هیچ موردی نمی‌رسید», the entry by its
Persian title and the reason in Persian. («بازبینی اجرا نشد.» exists for a run assembled without
`--review`; the playbook never does that.)

When the owner answers a lettered dispute («۱ الف»), the coordinator
runs `merge facts resolve` itself in a fresh run directory and confirms by the field's Persian
label.

### No Stage C — the run ends with the report

Until 2026-09-09 the run ended with an audit review: the coordinator ran the store-wide audit,
presented its findings as numbered items and asked the owner which to act on, one turn per item.
The owner ruled it out after the cooking run: of its 246 findings, 69 were a false positive in the
audit itself (recipe cells naming an item by its code, which the audit did not resolve), 13
described a removed process node as a changed process with a successor that did not exist, and
the rest were information (menu items no rule reads yet, constants no rule reads yet, roles no
process names). The reviewer already sees the audit's cross-entry checks for this run's own
entries in its digest, and the remaining checks matter *between* runs, when something else moved.
So the run now ends after the report. `merge facts audit` and `merge facts check` remain
operator commands (runbook 07 §5 and §10.4 below), and the two defects were fixed the same day.

That is the whole journey. The cooking run of 2026-09-08 took four bot turns, produced 226 entries
from 14 units (13 on their first attempt), and cost about 22 dollars of model time.

---

## 5. Journey 2 — the owner changes one thing: `/edit-fact`

The owner types, for example, «در شرح ۱۰ ثبت، واژهٔ «سیاهه» را به «برگه» تغییر بده» ("in the
statements of ten entries, change the word «سیاهه» to «برگه»"). The coordinator opens
`.claude/skills/edit-fact/SKILL.md`.

Why this playbook exists as a separate thing: the write ladder used by `apply` can only *create,
fill, dispute, append and union* — it never rewrites a value that is already there, and a prose
field is filled once and then never touched by a later run (a second run's different wording is
discarded, because free text cannot be "equal" between two runs and must not raise disputes). So a
plain wording correction has no path through `apply`. The **edit verb** (v3.7) is that path.

### Step 1 — Resolve the entry

The instruction is matched against `facts/.index.json` (the one-row-per-entry index): an id
(`F-00150`), else an exact key, else a Persian title or alias search, restricted to open entries.
Ambiguity is a Persian question listing the candidates; nothing is guessed. An instruction that
names *several* entries resolves to a list, and everything below runs once per entry, each in its
own run directory; one failure does not stop the others.

### Step 2 — Run directory and meta

`runs/facts/<dept>/<stamp>/meta.json` with `origin: "chat"`, `actor` (the Telegram user), and the
instruction verbatim. The department is the entry's first department, or `management` for a
universal entry.

### Step 3 — Classify, then write

| the instruction… | the vehicle | who writes it |
|---|---|---|
| **adds** something: a new entry from scratch, a dated successor, a fill of an empty leaf, a new source, account or alias | `facts-delta.json` → `merge facts apply` | the quantify agent in `targeted` mode, `form: delta` |
| **changes or removes** something and **names the value** (a word, a sentence, a number, a member to drop, a department to add) | `facts-patch.json` → `merge facts edit` | **the playbook itself** — nothing to compose |
| **changes** something and the wording must be **composed** (reword a statement, invent a title) | `facts-patch.json` → `merge facts edit` | the quantify agent in `targeted` mode, `form: patch` |
| **retires** or **merges** | `merge facts retire [--heir]` | — |

A **patch** is a small JSON file: a list of operations over field paths.

```json
{"schema_version": 1,
 "ops": [
   {"op": "set",    "path": "statement",                       "value": "برگهٔ روزانهٔ …"},
   {"op": "set",    "path": "data/outputs/vazn/value",         "value": 285},
   {"op": "remove", "path": "data/applies_to/pitza__s0__j__r6"},
   {"op": "unset",  "path": "data/pack"},
   {"op": "append", "path": "aliases",                         "value": "برگه روزانه"}
 ]}
```

A *path* is the same address the panel uses for a red mark: segments separated by `/`, a list
member named by its `key` (or, for `accounts[]`, its `id`). Operations apply in order.

### Step 4 — Preview, and the one question

```
merge facts edit --id F-00150 --patch <run>/facts-patch.json --run <run> --preview
```

The preview applies the patch to a copy, runs every check, writes nothing, and prints per
operation «فعلی: …» (current) and «پیشنهاد: …» (proposed). Then:

- **No question** for a mechanical change or an addition. The owner named the target and the
  exact value, and that *is* the approval invariant INV-5 asks for (owner ruling, 2026-09-09).
- **One question**, showing the values, for prose the bot composed, for any `remove`, and for a
  retire or merge — one message for the whole instruction, however many entries; if declined,
  nothing is written.

The owner sees only the «فعلی/پیشنهاد» pairs under the entry's title (and a member's own title
when the path names a column, input or output). The preview's `[1] set statement` lines are for
the bot's own reading and are never relayed — bot messages hide internals.

### Step 5 — The edit verb

```
merge facts edit --id F-00150 --patch <run>/facts-patch.json --run <run>
```

What the verb does, in order:

1. Requires `meta.json` in the run directory (the chat citation points at it); validates the
   patch against `facts-patch.schema.json`; finds the entry.
2. Applies the operations to a deep copy. Refused inside an operation: a path starting with
   `id`, `kind`, `key`, `status` or `updated_at` (identity and derived fields — a key is never
   renamed, a kind change is `promote`'s job); `set retired` with anything but `false` (retiring is `retire`'s job, so the entry
   gets a date and possibly an heir; *un*-retiring a mistake is allowed); a path that names
   nothing; an `append` of a member whose key is already there; a `set` that changes a member's
   key.
3. **Disputes settle.** A `set` on a field that has open accounts marks the account holding the
   new value `chosen` and every other `rejected`; if none holds it, a `chosen` chat account is
   added. A `remove`/`unset` rejects them all. Nothing is left for the panel to ask.
4. The result is validated against the store schema *before anything reads it* (a wrongly shaped
   value — `set scope "cooking"` instead of `scope/departments` — is a clean refusal, not a
   crash), `field_status` paths that no longer exist are dropped, `location` is recomputed, a
   chat source `{type: "chat", ref: "<run>/meta.json", run: "<run>"}` is added to `source[]`,
   `status` is re-derived, `updated_at` stamped.
5. **The gate** — exactly the store gate every run passes and nothing less: the store schema
   over the whole file, the full content pass with the store, declared unit symbols, registered
   departments and branches, every `F-` reference resolving. Any refusal: `precondition failed:
   …`, exit 2, nothing written — no snapshot, no delta record, no ledger row.
6. On success: snapshot to `facts-before/`, save the store, **write the chat confirmation ledger
   row** (section 5.4), and append `{"verb": "edit", "args": {"id", "patch", "ops"}}` to the
   run's `facts-delta.json` (a list, for a verbs run).

No `resolve` ever follows an `edit`; the verb settled everything itself.

### Step 6 — Commit and report

Same allow-listed commit (`edit-fact(F-00150,…): …`). The report is one line per entry: the title
and the «فعلی/پیشنهاد» pairs for a change; the id and what was added for an addition; "retired,
not deleted" and the heir for a retirement. It ends with «در پنل تأییدشده است» — "it is confirmed
in the panel" — because of the ledger.

### 5.4 The chat confirmation ledger — why a bot edit needs no panel step

The panel's tick (section 6) is a **fingerprint**: a SHA-256 hash of the entry's content, stored
in the panel's own database when a reviewer confirms. Any change to the entry moves the hash and
the tick silently disappears — that is the point of hashing instead of a boolean. But after a bot
edit *by the owner*, the owner has just said what the entry should say; making them re-tick it in
the panel would be a second signature for one act. The engine cannot reach the panel's database
(filesystem only), so it writes a small file the panel reads:

```
facts/.confirmations.json
{"schema_version": 1,
 "entries": {"F-00150": {"updated_at": "2026-09-09T09:12:31Z", "by": "owner",
                         "run": "runs/facts/cooking/20260909-091210", "at": "…"}}}
```

A row vouches while its `updated_at` equals the entry's current `updated_at`. Every engine write
path stamps the entries it changes, so a later change by *anything* moves the stamp and the row
goes stale — no shared hash is needed between the two components. `edit` writes the row always;
`apply`, `resolve`, `retire` and `promote` write it only when the run's `meta.json` says `origin:
"chat"`; `revert` removes a run's rows; every store save prunes stale rows. Both the engine and the
panel lock `facts/.confirmations.lock` (an OS-level file lock) around their read-modify-write, so a
panel revoke and a chat run cannot lose each other's update. The lock file is git-ignored; the
ledger is committed with `facts/`.

This is invariant **I7**: *a chat instruction is one round trip.* The store ends in a state that
needs no action in the panel.

The first real use happened on 2026-09-09: the owner's ten-statement change ran through the bot in
one commit, ten ledger rows, no dispute, nothing left to accept.

---

## 6. Journey 3 — a reviewer opens the panel

### 6.1 Signing in, roles, scopes

The panel's users live in its own SQLite database (`app.db`, on a volume outside the data-repo).
A username is a phone number; passwords are argon2 hashes; a session is a cookie with an absolute
expiry. Four roles exist and cannot be created through any API (they come from the seed):

| role | capabilities |
|---|---|
| `reader` | view, comment, export_pdf |
| `reader_no_download` | view, comment |
| `admin` | reader's + manage_users, manage_peers, view_audit |
| `editor` | admin's + **edit, confirm, set_visibility** |

A **scope** says *where* a capability applies: `*` (everything) or `dept:<code>`. Scope is checked
before capability, so a wrong guess at an id is a 404 indistinguishable from a typo (nothing leaks
about what exists), and an in-scope but forbidden action is a 403 that *is* recorded in the audit
table. A fact that names several departments requires the capability at **every** one of them
(QF-27). Readers never reach the facts routes at all: the facts panel is for people holding at
least one of edit / confirm / set_visibility / manage_users / view_audit.

### 6.2 The list

`GET /api/facts` returns every entry this caller may know about: one row per index entry with kind,
key, title, scope, status, `retired`, `stub`, `red_counts` (how many unanswered leaves and open
disputes), the current fingerprint and whether it is confirmed. Filtering (kind, department,
branch, confirmation, free text over title/id/aliases) happens in the browser over that one
response; the server has already applied scope and visibility. The UI deliberately does **not**
draw the served `coverage` number (workbooks read / total) — the owner refused it.

### 6.3 The detail bundle

`GET /api/facts/F-00150` returns a **bundle** — the entry plus everything a screen needs to draw it
in Persian without ever computing a name of its own:

| key | what it is for |
|---|---|
| `entry` | the fact document, whole for an editor of every department it names, kind-switched and source-stripped otherwise |
| `confirmation` | `{fingerprint, confirmed, can_confirm}` — the current hash (what a confirm must echo), whether the database mark **or** the chat ledger vouches, and whether this caller may confirm |
| `red_paths` | `{unknown: [...], disputed: [...]}` — every `null` leaf and every open-account field, as paths |
| `resolved` | every id, item key and process id the entry references → `{kind, title, code?, fields?}`, or `{restricted: true}` for a neighbour this caller may not open (the row stays so counts are honest; the name goes) |
| `row_titles` | reference-table row key → composed Persian title |
| `path_labels` | every red path → a Persian «column — row» label |
| `workbook_titles` | spreadsheet id → the workbook's title |
| `binding_labels` | a rule binding or record instance key → `{workbook, sheet, branch}` |
| `unit_titles` | unit symbol → Persian word, from the units record (`percent` → «درصد») |
| `original` | the verbatim formula or script body behind `original_ref` |
| `consumers` | the reverse index: entries that use this one |
| `processes` | this entry's process links, resolved live, with tombstone / heir / missing-node state |

### 6.4 The detail screen, top to bottom

Header chips (kind · shape · medium; confirmed or not; scope; a «باید عیناً در ERP پیاده شود» pill
for a rule marked `port`; retired). The title with the **confirm tick**. The statement, with
aliases. Then the cards, by kind:

- **Rule** — a *constant* draws one big number with its unit and nature («استاندارد», «هدف», «حد
  مجاز»); a *formula* draws the expression as a left-to-right island; a *decision table* draws
  its rows with the rule's own column titles; then the lifecycle card («اعتبار زمانی»: valid
  dates, supersedes / superseded by); then «متن اصلی» (the original formula, collapsed), the
  template row with its divergence, «محل اجرا» (one row per binding: workbook, sheet, branch,
  cell range, the numeric parameters), the calls, the inputs/outputs pair (each input says where
  it reads from — a record column, the operator, the calendar, or a bound parameter), and the
  edge cases.
- **Record** — either a *grid* (a reference table with its rows, cells painted red for unknown
  or disputed) or a *columns table* (title, unit badge, key, type, notes) plus *printed rows* (a
  paper form's fixed lines); then «ساختار و مکان جدول» with «نسخه‌ها» (the instances: workbook,
  sheet, branch, hidden) and «ورودی از» (imports), the grain, cadence, day boundary, primary key,
  who fills and who approves.
- **Item** — code, category, base unit, pack, group, grade, state, packaging units with their
  factors, tracked-in rows.
- **Measurement** — quantity and unit, «برای» (of which item), «زمان · توسط» (when, by whom),
  «ثبت در» (which record column), method, exceptions.
- **Disputes** («روایت‌های متعارض») — open accounts grouped by field, each with its value, the
  speaker's role, the source, the verbatim statement, and a button «انتخاب این روایت» that calls
  `POST /api/facts/{id}/resolve` — the panel's *only* write, and it too goes through the engine
  (`merge facts resolve` in a fresh run directory, then a git commit).
- **Field status**, **Issues** (known defects with their dates and fixes), **Sources** (download
  only — a citation opens the file through `GET /api/facts/source`, which resolves against
  exactly three roots and only for a file *cited by an entry this caller may see*), **related
  processes**, **consumers**, and a footer with id, key, spreadsheet id and last change.

Every Latin run — a key, a code, a formula, a number — is drawn inside one component, `Mono`, as a
left-to-right island, so Persian text around it does not reorder (rule QF-42). Every Persian word
on the screen comes either from the entry itself (titles the agent wrote) or from one label table
(`factsLabels.ts`) that a build-time test checks against the schemas' enums — an enum value
without a label fails the build rather than showing English.

### 6.5 Confirming, revoking, and what the panel hides

`POST /api/confirmations/F-00150` with the fingerprint the screen showed. If the entry moved since
(the hash differs), 409 — re-read and try again. The stored row is `(target, fingerprint,
confirmed_by, confirmed_at, data_repo_commit)`; the last field is the data-repo's git HEAD at that
moment, so a database restored from an older backup can be told apart from genuine drift.
`DELETE` withdraws the mark — and, for a fact, removes the chat ledger row too, under the lock.

Visibility: an **editor** of every department a fact names sees it whole, confirmed or not. Anyone
else in the panel sees only *confirmed* entries (database mark or chat ledger), only the kinds the
global visibility policy switches on, and with sources stripped if that switch is off. A neighbour
the caller may not open appears as `{restricted: true}` — «خارج از دسترسی شما».

---

## 7. The store — every file, every field

### 7.1 Files under `facts/`

| file | holds |
|---|---|
| `items.json`, `records.json`, `measurements.json`, `rules.json`, `notes.json` | `{"schema_version": 2, "entries": [...]}` — one file per kind, the whole store (global; a department is a *scope tag*, not a partition) |
| `.index.json` | one flat row per entry (id, kind, key, title, aliases, scope, status, retired, valid_to, stub, processes, field-status counts, updated_at) — what the bot, the audit and the panel list against without loading payloads; rebuilt on every save |
| `.id-seq.json` | `{"fact": 233}` — the global id counter; ids are `F-` plus five digits, one namespace for all five kinds, never reused |
| `originals/F-xxxxx.txt` | the verbatim formula or script body of a rule, out of line |
| `.confirmations.json` | the chat confirmation ledger (section 5.4) |
| `.confirmations.lock` | its lock file (git-ignored) |

Today's live store: 137 items, 43 records, 5 measurements, 40 rules, 8 notes — 233 entries, matching
the counter exactly.

### 7.2 The envelope — fields every entry has

| field | meaning |
|---|---|
| `id` | `F-00150`. Minted only by `allocate-id` (INV-1). |
| `kind` | `item`, `record`, `measurement`, `rule` or `note`. |
| `key` | An ASCII handle: lowercase segments joined by `_`; `__` is reserved as the *join* operator for composed keys (`gozaresh_markazi__s4`). Persian never appears in a key (QF-32). Immutable once written. |
| `title` | The Persian display name (at most 60 characters, a noun phrase). |
| `aliases[]` | Other names, for search only — never for identity. |
| `statement` | One to three Persian sentences saying what it means: what is measured or computed, in what unit, by whom, when. A *prose leaf*: filled once, never disputed, changed only through an edit. |
| `scope` | `{departments: [...], branches: [...]}`, both sorted and unique. Empty means universal. |
| `source[]` | Where it came from (7.3). |
| `field_status` | `{path: "inferred" \| "informal"}` — leaves the agent inferred or that were stated as a habit rather than a standard. |
| `accounts[]` | Disputes (7.4). |
| `valid_from`, `valid_to` | Business validity, **Jalali** dates (`1405-06-17`), the one place the store keeps a Persian-calendar date. |
| `supersedes`, `superseded_by` | `{ref}` links between eras of the same definition. |
| `retired` | The only deletion (INV-4). A retired entry leaves the panel's default views but stays resolvable. |
| `issues[]` | Defects in the artefact as implemented (7.5). |
| `processes[]` | Process ids this entry is *about* — a claim that must be backed by a `process`-typed source citing the node. |
| `status` | **Derived, never written by a delta**: `disputed` if any account is open; else `unknown` if any data leaf is `null`; else `informal` / `inferred` from `field_status`; else `confirmed`. |
| `updated_at` | ISO-8601 UTC, stamped by every write path that changed the entry; the chat ledger keys on it. |
| `data` | The per-kind payload (7.6). |

### 7.3 `source[]` — provenance

Every member has a `type`, a `ref` (a path under the data-repo, `null` for chat), a locator that
depends on the type, a `hash` (SHA-256 of the file, computed by the engine — an agent asked for a
digest would invent one), and the `run` that first cited it. `quote` (verbatim words) is admitted
on voice, comment, sheet, process, docx, pdf and photo sources.

| type | locator | cites |
|---|---|---|
| `sheet` | `sheet`, `cell` | a workbook tab or cell |
| `script` | `function` | a `.gs` function |
| `comment`, `validation`, `cf` | `sheet`, `cell` | a cell comment, a drop-down list, a conditional format |
| `voice` | `lines` (`175-347`) | a transcript passage |
| `docx`, `pdf` | `page` | an attachment |
| `photo` | — | a photographed form |
| `process` | `node`, `quote` | a node of a process document |
| `chat` | — | the owner's instruction (`ref` names the run's `meta.json`) |

### 7.4 `accounts[]` — a dispute

When two sources disagree about one leaf, nothing is overwritten: the engine records both as
*accounts* on the field and the entry becomes `disputed`.

| field | meaning |
|---|---|
| `id` | eight hex characters — a hash of field, statement, value and source, minted by the engine |
| `field` | the path of the disputed leaf (`data/outputs/v/value`) |
| `statement` | the verbatim words of that side |
| `value`, `unit` | the parsed value |
| `source` | where that side came from (same shape as a source, minus hash and run) |
| `speaker_role` | a role, never a name |
| `status` | `open` (unresolved), `chosen` (the winner), `rejected` (the loser, kept for the record) |

The first time a path is disputed, the *incumbent* value is materialised as an account too, so the
owner always chooses between two documented sides. Resolution (`merge facts resolve` from the
panel or the bot, or a `set` in an edit) installs the chosen value and settles the rest.

### 7.5 `issues[]` — defects found in the files

`{kind, description, affects[], field?, instance?, from_date?, to_date?, engine, fix?}`. Kinds:
`scale` (kg/g switched), `unit_kind`, `column_shift`, `junk`, `bug`, `cross_record` (drop-down
lists differ between branches), `code_collision`, `hand_maintained_index`, `no_rule_applies`,
`broken_formula` (`#REF!`, `#NUM!`), `cached_error` (`#NAME?`, `#N/A`, `Loading...` — an unbound
function or a mid-import export, not a defect), `leading_offset`, `unused_mirror`,
`unknown_source`, `column_offset`, `per_cell_mirror`, `ambiguous_row_header`, `binding_gone`,
`unread_attachment` (a file with no converter), `oversized` (a table too big for one unit). Issues
are anchored to *dates*, not rows, because rows move. `fix` is `{op: multiply|divide|shift_columns|
ignore, factor?}`.

### 7.6 The five kinds

**item** — a thing counted, weighed or priced. `code` (`#780` a product, `##1` an ingredient,
kept verbatim), `code_absent`, `category` (`ingredient`, `product`, `packaging`, `consumable`,
`place`, `other` — a *place* is an item so a transfer can name it), `unit` (a key of the units
record), `unit_raw` (the estate's own spelling), `pack` (`{size, unit}`), `units[]` (other pack
levels: `{pack_unit, factor_to_base}`, the factor a number or a `{min, max}` range), `group`,
`state` (`raw`, `cooked`, `frozen`, `prepared`), `grade`, `tracked[]` (`{record, value, reason}` —
"we do not count X, because …" as data).

**record** — a persistent place numbers are written, or a table of definitions. Modelled on
Frictionless Table Schema. `medium` (`sheet`, `paper`, `external`, `native`), `role` (`log`,
`reference`, `report`, `config`), `location` (closed per medium: a sheet has spreadsheet id, sheet
id, tab name, hidden; paper has `kept_at` and `holder`; external has `system` and `kept_at`;
native has `kept_at`), `grain` (what one row is), `cadence` (`nightly`, `shift`, `daily`,
`weekly`, `monthly`, `ad_hoc`), `day_boundary`, `filled_by`, `approved_by`, `blank_master`,
`fields[]` (each: `key`, `title`, `type` string/number/integer/boolean/date, `unit`, `unit_raw`,
`description`, `constraints` {enum, readOnly, required, minimum, maximum}, `refItems`
{namespace, resolved_by} — "cells in this column name an item", `derived` {ref} — "this column is
computed by that rule", `filled_by`, `group`, `columns` {instance: letter}), `header_fields[]`
(captured once per sheet), `sections[]`, `rows[]` (a log's fixed printed lines or a reference
table's data rows; reserved member names `key title unit unit_raw section when open retired
valid_to supersedes`; a reference row's key is the `__`-join of its primary-key values), `signatures[]`
({role, row_range}), `primaryKey[]`, `instances[]` (every physical copy: `{key, spreadsheetId,
sheetId, sheet, branch, hidden, imports[]}`), `imports[]` on an instance ({key, source, range,
named_range} — a mirror tab's pull), `movement` ({from, to} places), `reconciled_against[]`,
`template_of`, `divergence`, `stub`. `location` is *derived* from the first instance and recomputed
on every write.

**measurement** — what is captured, by whom, into which field. `of` {ref item}, `quantity`
(`mass`, `count`, `volume`, `duration`, `money`, `ratio`, `other`), `unit`, `method`, `when`, `by`,
`writes_to` {ref, field}, `exceptions`.

**rule** — a computation, a decision or a constant. `inputs[]` (each `key`, `title`, `unit`,
`from` — `{ref, field}` a record column, `{param}` a per-binding parameter, `"operator"`,
`"calendar"`, or null — and `via` a conversion rule), `outputs[]` (each `key`, `title`, `unit`,
`nature` `standard`/`target`/`observed`/`limit`, `of`, `per`, `writes_to`, `share`, and on a
constant `value` or `range` {min, max} with either end possibly open), `lang` (`feel` a formula in
the small expression language; `table` a decision table; `text` a policy with no formula;
`sheets`/`gs` verbatim originals), `expr`, `table` ({inputs, outputs, rows — **flat objects keyed
by the columns**, hit `first`/`unique`/`collect`, aggregate, default} — invariant I8), `original_ref`,
`calls[]`, `edge_cases[]`, `identifier`, `applies_to[]` (bindings: `{key, record: {ref, field},
variant, range, params, rows[]}`), `template_of`, `divergence`. **A constant is a rule with empty
inputs.**

**note** — the escape hatch. `about[]` (what it concerns), `question` (the open question). Its key
is a hash of its targets and question, so the same note built twice is one note. `merge facts
promote` turns a note into a real kind on approval.

### 7.7 Keys — how a name is minted

A sheet-derived rule gets a *concept* key from the agent (`masraf_elami`); the workbook and column
live in `applies_to[]`, never in the key. A record template gets a concept key; its instances are
`<short>__s<sheetId>`; a binding is `<instance>__<column letter>__r<first row>`; a binding's row is
`r<row>`. An item from a code is `ing_1` or `food_61` (the namespace comes from the manifest's
`conventions`). A measurement is `<item>__<record>__<column>`. A note is `note_` plus twelve hex
characters. Read-before-mint is the rule: the unit's input carries a reuse slice so an existing
key is reused rather than reinvented.

### 7.8 The units record

One special record, key `units`, medium `native`, role `config`, holds the unit vocabulary as
rows: `{key, symbol, dimension, factor_to_base, unit_title}` — `g`/mass/1/«گرم», `kg`/mass/1000/
«کیلوگرم», `pcs`/count/«عدد», `percent`/dimensionless/0.01/«درصد» … Every `unit` leaf anywhere in
the store must name one of its open rows (QF-40); the panel's Persian unit words come from it.

---

## 8. The run directory — every artefact

`runs/facts/<dept>/<stamp>/`:

| artefact | written by | holds |
|---|---|---|
| `meta.json` | the playbook | the run's identity card (schema `facts-run-meta`) |
| `turn.json` | `facts-plan status --new-turn` | when the current turn started |
| `plan.json` | `facts-plan build` | unit ids, inputs, candidates, estimates, file hashes — immutable |
| `skeleton.json` | `facts-plan build` | every candidate with its mechanical payload; instances, imports, issues, unit symbols |
| `functions.md` | `facts-plan build` | the estate's function library |
| `units/<u>/input.md` | `facts-plan build` | everything one unit may know |
| `units/<u>/out.<n>.json` | the quantify agent | the unit's decisions (`facts-unit`), at most two attempts |
| `review/input.md`, `review/input.sha256` | `facts-plan digest` | the reviewer's view and its hash |
| `review/out.json` | the quantify agent | the review's decisions |
| `facts-delta.json` | `facts-plan assemble` (pipeline) **or** the verbs (a growing list of `{verb, args}`) | the proposed changes, or the record of what the verbs did |
| `assembly.json` | `facts-plan assemble` | dropped, undecided (with reasons), provenance, review status, the review's held-back decisions |
| `gate-b.md` | `facts-plan assemble` | the run's record of what it proposed (no longer sent) |
| `facts-before/` | `apply` and every writing verb | the five store files before the write — what `revert` restores |
| `id-map.json` | `apply` | temp id → minted id |
| `touched.json` | `apply` | every open entry the run changed |
| `adopted.json` | `apply` | stub adoptions (always written, `[]` when none) |
| `facts-patch.json` | the edit-fact playbook (or the agent) | the patch an edit applied |
| `manifest-proposal.json` | the quantify agent, manifest mode | Gate M's proposals |
| `report.md` | `facts-plan report` | the owner's closing report |

---

## 9. The schemas — the frozen contracts

A **JSON Schema** is a machine-readable description of what a JSON file may contain: which keys,
which types, which values. Every file the system writes or reads is validated against one. The
schemas are "frozen": they are the data contract, changed only by design, and `make test` checks
them. The engine loads them from `SCHEMA_DIR` and caches the compiled validator.

| schema | governs | who validates against it, when |
|---|---|---|
| `facts.schema.json` | the five store files | `save_store` before every write; `validate facts`; the edit verb's gate |
| `facts-delta.schema.json` | a proposed change set | the unit gate (materialised entries), `assemble`'s output, `apply`'s first step, `validate facts-delta` |
| `facts-unit.schema.json` | a unit's or the review's decisions | `validate facts-unit` |
| `facts-patch.schema.json` | an edit's operations | `merge facts edit` |
| `facts-confirmations.schema.json` | the chat confirmation ledger | every ledger save |
| `facts-run-meta.schema.json` | a run's `meta.json` | the playbooks (`validate facts-run-meta`) |
| `facts-idseq.schema.json` | the id counter | — |
| `facts-index.schema.json` | `.index.json` | — |
| `manifest.schema.json` | the workbook manifest | `dump-workbook --manifest`, the Gate M write |
| `manifest-proposal.schema.json` | the agent's Gate M proposals | Gate M |

Differences worth knowing between the store schema and the delta schema: a delta entry has a
temporary id `T-<n>` (or none), carries the original formula text *inline* as `original` (the store
has `original_ref`, a path), carries no `status` or `updated_at` (the engine derives them), and an
account carries no `id` (the engine mints it). The unit schema is stricter still: a unit's `data`
may set only the judgement subset of each kind (a record's role, grain, cadence, fields' renames
and units — never its location or instances), and a `contradiction` is admitted only in the
review.

---

## 10. The rules — what is enforced, where

### 10.1 The invariants

From the data-repo's standing orders: **INV-1** ids only from `allocate-id`; **INV-2** the runtime
session edits data, never code or config; **INV-3** no fabrication — an empty field beats a
guessed one; **INV-4** no automatic deletion — retire, never remove; **INV-5** human approval
before overwriting a filled value (an explicit instruction naming the value *is* that approval).

From the facts design: **I1** the unit gate is the store gate; **I2** every attachment is read or
named unread; **I3** a tombstoned process is never read as content; **I4** the engine's own
candidates pass the engine's own gate (`facts-plan preflight` proves it for a department with no
model cost); **I5** a run stops only when nothing can be assembled — everything else is a
hold-back with a reason; **I6** the estate's spellings (branch tokens, code namespaces, placeholder
headers, month names, the table prefix) are manifest data, not code; **I7** a chat instruction is
one round trip; **I8** a decision table has one row shape.

### 10.2 The write ladder (`merge facts apply`)

Applied per leaf, identical for every caller:

- **prose leaves** (`statement`, `grain`, `method`, `exceptions`, `reason`, `why`, `description`)
  — filled once, then never disputed and never rewritten (free text cannot be "equal");
- **scalars** — absent → create; empty → fill; equal (numbers as numbers) → nothing; different →
  **dispute** (materialise the incumbent as an account, add the challenger; never overwrite);
- **union fields** (`source`, `aliases`, `processes`) — set-union on a dedup key;
- **keyed collections** (`fields`, `rows`, `inputs`, `outputs`, `accounts`, `issues`, `instances`,
  `applies_to`, …) — match a member by its key (or a dedicated dedup key: an account by field +
  statement + value + source, an issue by kind + field + date, a signature by role, …), merge the
  match leaf by leaf, append the rest;
- **object fields** (`from`, `writes_to`, `pack`, `range`, `scope`, …) — recurse leaf by leaf, so
  `scope` disputes as `scope/branches`, not as a blob;
- **immutable** (`id`, `kind`, `key`, `status`, `updated_at`, `field_status`, `valid_from`,
  `valid_to`, `retired`) — never touched by the ladder; **derived** (`location`) — skipped and
  recomputed.

A later `valid_from` on a differing value is not a dispute but a **supersession**: a successor
entry is created, the predecessor closed.

### 10.3 The content pass (`validate`, the unit gate, `apply`, the edit gate)

Thirteen numbered checks per entry, in one shared function so no two gates can word the same
rule differently: the expression grammar (only declared identifiers, the one aggregate form); unit
edges (an input's unit equals its source column's unit or names a `via` conversion); key grammar
and the `refItems` cell rule (a cell is an item key or a code of the column's namespace); process
id grammar; record shape (reserved row names, primary key members declared, every row member
declared, a typed reference table's rows complete); shares in (0, 1] summing to one; constant shape
(no inputs ⇒ no formula, every output a value or range; inputs ⇒ a language and a body); the
decision-table shape (I8); field-status paths exist; reconciled cells declared; Jalali issue
dates; no citation of `.structure.md`; every process link backed by a process source; and the
**style lint** on every prose leaf — no A1 address, no artefact name (`Table_`, `.xlsx`, `.gs`,
`IMPORT_FROM_SHEET`, `LET(`), no pipeline word («پاس», «اسکلت», «بچ», `expr`, …), no colloquial
ending, «ستون/تب/سلول» only in a record's own statement or a field's description, no Latin word of
four letters or more except csv/Excel/sheet and declared unit symbols, no quotation over eight
words. Messages are grouped one line per rule («… — 16 entries: F-…, …»), because a run that
relayed 2 068 one-per-cell errors taught everyone that nobody reads them.

### 10.4 The audit (`merge facts audit`)

Read-only, always exit 0, twenty-six checks, each `{code, id, message, proposal}`: `two_writers`,
`duplicate_title`, `note_overlap`, `equal_expr`, `duplicate_code`, `edge_disagreement`,
`orphan_ref`, `dangling_ref_items`, `process_link` (a link to a tombstoned process, with the heir
proposed), `process_node_gone` (a cited node removed from a live process), `row_gone`, `dump_missing`, `binding_gone`, `expr_missing`, `retired_row_live_edges`,
`template_drift`, `reconciliation` (a table cell and the report constant differ by over 1 %),
`component_sum`, `unconsumed_constant`, `no_consumer`, `quantity_off_enum`,
`note_targets_retired`, `import_unresolved`, `stale_prose`, `stale_stub`, `natural_key_dup`,
`scope_shadow`, `unknown_role`. `check` adds `source_moved`, `estate_absent`, `uncited_workbook`
and the readiness line.

### 10.5 Nothing written on refusal, and undo

Every writing command has the same contract: check everything first; on any refusal print
`precondition failed: …` to stderr, exit 2, and leave every file exactly as it was — no snapshot,
no run record, no ledger row. Files are written atomically (temp file in the same directory, then
rename). Every write takes a snapshot first, and `merge facts revert --run <dir>` undoes one run at
entry level: created ids are removed (never reused), matched entries restored wholesale from the
snapshot, the run's ledger rows forgotten. It refuses if a *later* run touched any of the same
entries, and it refuses a run that adopted a workbook stub (revert the git commit instead). And
behind all of that is git: every run and every edit is a commit on the data-repo, made with an
allow-list of paths.

---

## 11. The other engine commands and the sibling feature

- **`facts-plan preflight <dept>`** — builds a plan in a temporary directory, writes a bare
  `keep` for every candidate, and runs the unit gate on each; exits 2 only when the *engine's* own
  candidate is refused. Run it before a department's first real run. Nothing under the data-repo
  is written.
- **`facts-plan build <dept> --run <dir> --refresh-inputs`** — re-renders every unit's `input.md` from the plan
  and skeleton on disk (how a changed card reaches a run in progress).
- **`merge facts export --record units --out …`** — a reference or config record's rows as CSV,
  outside `facts/` and `runs/`.
- **`merge facts repair-source-refs`** — rewrites a citation's `ref` that names no file into the
  path it should have been (a bare spreadsheet id, a path that lost its root); the one verb that
  exists because a corrected citation is a *different* union member, so a delta would add a second
  one beside the broken one.
- **The process feature** (`/process-voice`, `/edit-process`, the `extract` agent) is the sibling
  system that turns meeting recordings into process diagrams under `departments/<dept>/processes/`.
  It shares the audio and transcripts, its own `merge` verbs write those files, and a fact may cite
  one of its nodes. It is not covered here.

Bot 1, **upload-bot**, is where files come in: `/start` → «صوت» → the meeting's Jalali date → the
departments → the voice file, saved as `meetings/audio/<depts>-<date>.ogg` and transcribed in the
background to `meetings/transcripts/raw/`; or «فایل» → one department → documents, saved under
`departments/<dept>/attachments/`. Everything is staged first and moved into place atomically. Only
the allow-listed Telegram id is served.

---

## 12. Known gaps and open questions (as of this writing)

These are true statements about the code today that a newcomer might otherwise mistake for their
own misunderstanding.

- **`processes[]` is empty on every entry**, although 67 sources of type `process` exist. A
  process source grounds an entry's provenance; the link list is a stronger claim ("this node
  names this entry") that the units have not been making. Nothing consumes the list yet except
  the panel's "related processes" card, which then shows nothing.
- **Coverage is served but never drawn.** `GET /api/facts` returns `{read, total}` workbooks; the
  owner refused the line in the UI on 2026-08-31. The engine's `readiness:` line is only visible in
  the bot's Stage C.
- **A note has no kind-specific card** in the panel; it is drawn with the shared statement,
  lifecycle and sources cards only.
- **The id space is five digits** (`F-99999`); the minter would produce a six-digit id after that
  and the reference grammar would refuse it. Far away, but undocumented.
- **The id counter is written non-atomically and without a lock.** Two concurrent applies would
  collide; today there is one writer.
- **Two ADR statements are stale**: `build` no longer refuses a twin-spanning candidate (it unions
  the groups) and no longer refuses an unfittable group (it sets candidates aside). The runbook is
  right; ADR 0017's body is not.
- **`foreignKeys` is dead code** in the content pass and the ladder: absent from both schemas, so
  never reached.
- **The chat ledger keys on `updated_at` at second resolution**: a write landing in the same
  second as the vouched one leaves the row standing. Documented; no code guard.
- **Upload-bot has no handler for a compressed Telegram photo**, only for documents; a photo sent
  as a file goes through the file flow and is read by the vision model later.
- The bot's report names a newly *added* entry by its id (the owner's rule says prefer the title);
  and a wrongly shaped patch value is refused with an English engine message. Both parked.

---

## 13. Glossary

- **account** — one side of a dispute about a field's value, kept with its source; the panel or
  the bot chooses one.
- **agent / sub-agent** — a separate model call with its own instructions and a fresh context,
  dispatched by the coordinator with the `Task` tool; here always the *quantify* agent.
- **binding (`applies_to[]`)** — one place a rule runs: an instance, a column, a row range, and
  the numbers that differ there.
- **candidate** — something the planner found that might be a fact, with a provisional `S-` id.
- **card** — a block of rules rendered into a unit's input: the expression card, the style card,
  the shape section.
- **checkpoint / gate** — a point where the coordinator ends its turn and waits for the owner
  (Gate M: the manifest; Gate A: the inputs; the former Gate B was removed on 2026-09-09).
- **coordinator** — the bot's own Claude Code session following a playbook.
- **delta** — a proposed set of changes to the store (`facts-delta.json`), with temporary ids.
- **dump** — what `dump-workbook` extracts from a workbook (structure and formulas, not values).
- **engine** — the deterministic command-line programs; the only writer of the store.
- **fingerprint** — a SHA-256 hash of an entry's content; the panel's confirmation is a
  fingerprint, so any change silently un-confirms.
- **hold-back** — an entry the assembly could not land, kept in `undecided[]` with a reason
  instead of stopping the run.
- **instance** — one physical copy of a record template (one tab in one workbook).
- **invariant** — a rule that must always hold; INV-n from the standing orders, I-n from the
  facts design.
- **Jalali** — the Persian calendar; business dates in the store are Jalali strings.
- **ledger (chat confirmation)** — `facts/.confirmations.json`, the engine's way of telling the
  panel "the owner vouched for this through the bot".
- **manifest** — `attachments/sheets/manifest.json`, one row per workbook with the owner's answers.
- **mirror tab** — a tab whose only formula is `IMPORT_FROM_SHEET(...)`: an edge, not a record.
- **natural key** — `(kind, key, scope)`; two open entries never share one.
- **patch** — an edit's list of set/remove/unset/append operations.
- **playbook / skill** — a Markdown file of instructions the coordinator follows (`SKILL.md`).
- **prose leaf** — a free-text field (statement, grain, method, …) filled once and never disputed.
- **QF-n** — a numbered design rule from the facts specifications.
- **reference tab / record** — a table that *is* a definition (a recipe, a price list); its cells
  are dumped and stored as rows.
- **run** — one execution of a playbook, with its own directory under `runs/facts/`.
- **scope** — the departments and branches an entry belongs to; empty means universal.
- **skeleton** — `skeleton.json`, every candidate with its mechanical payload.
- **snapshot** — `facts-before/`, the store as it was before a run wrote; what `revert` restores.
- **stub** — a placeholder record for a workbook not yet read; adopted when it is.
- **supersession** — a new era of the same definition: a successor entry, the predecessor closed
  with `valid_to`.
- **temp id** — `T-<n>`, an id inside a delta before the engine mints a real `F-` id.
- **turn** — one model response to one Telegram message; the playbook controls where it may end.
- **unit** — one parcel of work small enough for a single model call; the unit of retry (two
  attempts) and of blame.
- **unit gate** — `validate facts-unit`: the check a unit's output must pass, which is the store's
  own check applied early.
- **yield** — the engine's instruction (after forty minutes of a turn) to end the turn and let the
  owner resume with the next message.
- **write ladder** — the leaf-by-leaf merge rules `apply` uses: create, fill, no-op, dispute,
  append, union — never overwrite.
