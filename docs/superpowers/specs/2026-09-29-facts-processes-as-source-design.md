# Facts runs read the corrected processes — design

**Status:** proposal for the owner's approval, 2026-09-29. **Nothing in this document is implemented.**
**Asked for by:** the process engineer's test report of 2026-09-27 (the facts are built from the raw
meeting text, which she corrected in the processes and diagrams but not in the transcripts; main
points are missing — burger's one form, Philadelphia's conversion form no longer filled) and the
owner's rulings in the design conversation of 2026-09-28/29, listed in §2.
**Builds on:** tables as the spine (2026-09-16), form-anchored units (2026-09-15), gate tiers
(2026-09-13), v3.8 review-never-dropped.
**Scope:** `engine/facts_plan` (build, assemble, report, status), `schemas/facts-unit.schema.json`, a
new `schemas/photo-groups.schema.json`, `deploy/control-bot.Dockerfile`; in the data-repo the
`quantify` agent and playbook and the frontmatter of all five agents. No UI change, no store-format
change, no migration.

---

## 1. Why

The last preparation run (2026-09-26, `runs/facts/preparation/20260926-091928`) had 12 units: ten
read whole raw transcripts, one read the seven sheet tables, one read all fourteen form photos, and
the two form units were handed transcript passages as their «related talk». Processes reached a unit
only as a list of 40 node **labels** (`build.py` `process_index` → `render` `"processes"`), there so
a unit could cite a node. No unit ever saw a node's description, actor or ICOM — which is where the
process engineer made her corrections. What that produced, all in the store today:

| Store entry | What it says | What her process says |
|---|---|---|
| F-00207 (voice, `preparation-1405-06-04` L1–473) | «کنار شنیسل خام تنها برای ناهار و شام پرسنل مصرف می‌شود» — and it cites `preparation-012-n039` | n039: «…تنها برای تولید مرغ پیتزای پخته به کار می‌رود و در غذای پرسنل مصرف نمی‌شود» |
| F-00008 / F-00112 | the burger conversion form; burger listed under the general semi-finished form F-00009 | `preparation-026-n023`: burger has ONE printed form, «نیمه ساخته برگر» on top and «تبدیل برگر» below |
| F-00010 | the beef-loin conversion form records the Philadelphia weight (read off the photo) | n023: Philadelphia has no conversion form from now on, only the semi-finished form |
| F-00019 | «پرسنل هر لاین… سهم همان لاین را وارد می‌کند» — citing `preparation-026-n017` | n017: the **supervisor** fills the spider Excel daily from each line's notebook |
| F-00021 | a daily dough-production table | n017: the dough section is not fillable from preparation; flour in / dough out are recorded in no form |

The process text is small enough to hand over whole: preparation's 32 active processes are ~344K
characters (≈120–190K tokens by the engine's conservative estimator), cooking's ~420K; the pipeline
model has a 1M window, and the last run's units already read 215K-character inputs by paging.

The report the bot sends at the end of a run also leaks internals: of the store's 18 open disputes
for preparation, 12 ask the owner to choose between two near-identical titles, `number`/`integer`,
or two FEEL expressions with ASCII keys.

## 2. The owner's rulings (2026-09-28/29)

1. Agents get **all** active processes — every non-tombstoned one; nobody confirms first.
2. When a process and another source conflict, **the process wins**.
3. Transcripts stay (they hold facts no process or table has), but are read **after** tables and
   processes, only to find what is not yet recorded.
4. **One agent per table**: a sheet tab, and a photo — two photos of one table go to one agent, and
   an agent (not the orchestrator) decides which photos belong together.
5. Her per-table questions (who fills it and how each field is measured, exceptions, filling rules)
   are **guidance** to the agent; no engine check per column.
6. A transcript statement that contradicts a process is dropped **and listed at the end of the bot's
   final report**.
7. The report's internals leak is fixed in the same work.
8. Preparation's facts are **reset to zero and re-run**; the ~11 hand-made entries are not carried.
9. Cost ≈ $25–40 per preparation run on Opus 5.5 is accepted: one agent per table, 2–3 transcript
   agents.
10. **Every Claude agent moves to Opus 5.5 (1M) at effort high** — the four process agents,
    `quantify` and the bot's main session.
11. Work never interferes with the other agent's: own worktree, own data-repo clone, own container.

## 3. Principles

1. **Forms decide structure; processes decide practice; transcripts only fill gaps.** Which columns
   exist and their printed titles and units come from the sheet or the photo. Who fills a table,
   when, how each value is measured, the exceptions, and whether a printed column is still filled
   come from the processes. A transcript adds what neither says, and never overrides either.
2. **Read whole, not ranked.** An agent is given all of its department's processes. The link between
   a table and a process is usually through the table's items, not its name, so a ranked slice by
   name is exactly what misses it.
3. **One table, one agent.** The output cap (20K) is per agent; a full analysis per table does not fit
   several tables into one.
4. **A transcript never creates a choice.** A contradiction is set aside and shown, not stored as a
   second side.
5. **Ask the owner only what she can judge.** A data type, a formula, a key, or two wordings of a
   title are never an «اختلاف».

## 4. The run

| Stage | What changes |
|---|---|
| 0 Resume, M, A, 1 Transcribe, 2 Prepare | unchanged |
| **G Group photos** (new) | one `quantify` agent in `group` mode writes `{run_dir}/photo-groups.json` (§6) |
| P Plan | `facts-plan build` writes the process files (§5.1) and plans phase 1 one-table-per-unit (§5.2) and phase 2 in 2–3 units (§5.4) |
| U Units | phase-1 units read their input and the process files; phase-2 units read their excerpt, the process files and phase 1's entries in full |
| R, V, 5, 6 | unchanged apart from §8 |
| 7 Report | §9 |

## 5. Plan (`facts-plan build`)

### 5.1 Process files

`build` writes one Markdown file per department that has processes to
`{run_dir}/processes/<department>.md` — every department, not only the run's. Per process, in id
order: `# <id> · <name>` and the summary; per node, in file order:

```
## <node id> · <label>
مجری: <actor>
<description>
ورودی: …  کنترل: …  خروجی: …  سازوکار: …        (only the non-empty ICOM lists)
بعدی: «<label of the target node>» — <edge label>   (one line per outgoing edge; « — <label>» only when the edge has one)
```

The edges are the diagram the process engineer corrected: preparation's active processes have 751,
and 133 carry a condition («در صورت مشاهده تکه کپک‌زده», «در صورت سفارش بیکن», …) — the exceptions
her per-table questions ask for. An edge whose target is a subprocess or a missing node prints the
target's id instead of a label.

Tombstoned processes are skipped (I3, as `process_index` does today). Positions, layout, sources and
`pending` are left out. The files are rewritten by `refresh_inputs` like every input.

### 5.2 Phase 1 — one table per unit

- **Workbook units split by tab, always.** `_axis_parts` already splits a workbook unit by the sheet
  its candidates sit on; today only when the unit is over budget, now for every workbook unit. A
  twin pair still plans as one group and then splits by tab like any other.
- **Attachment units follow `photo-groups.json`.** The file names photos by their own path (`.jpg`,
  `.png`); `build` maps each to the cached description it already plans on
  (`attachments/.text/<name>.image.md`). One unit per group, in the file's order; every other
  attachment (pdf, docx) is one unit per file. The packing loop in `plan_units` goes.
- **Without a valid grouping** (file missing, unparseable, a photo in two groups or none, a path that
  is not one of the department's photos) every photo is its own unit and `build` prints one English
  line to stderr. The run never stops on the grouping.
- The F4 invariant (every attachment read by exactly one unit) is unchanged and still checked.

### 5.3 What a phase-1 input carries

Removed: `## گفت‌وگوهای مرتبط` (the related talk — `related_talk`, `talk_section`, `anchor_tokens`,
`TALK_*` and `unit["talk"]` go) and `## گره‌های فرایند` (the 40 ranked labels, `rank(nodes, …)` and
`unit["nodes"]` go).

Added, in the slot the node list held — `## فرایندها`:

```
فرایندهای این بخش — همه را کامل بخوانید:
  {run_dir}/processes/preparation.md
فرایندهای بخش‌های دیگر — اگر اقلام یا ستون‌های جدول در آن‌ها آمده، بخوانید:
  {run_dir}/processes/warehouse.md · انبار
  …
```

The core `fits` check is untouched: the process files are separate files, not part of `input.md`.

### 5.4 Phase 2 — 2–3 transcript units

- `transcript_chunks` budget 42 000 → 70 000 tokens. Preparation's ~140K of transcripts plans as 2–3
  units instead of 10.
- `est_tokens_out` for a transcript unit: `0.4 × in` → `0.15 × in` — a gap-filling unit writes
  little, and 0.4 × 70K would split every chunk on the output cap. The constant is frozen in
  `expected.json` and moves there too.
- `recorded_slice` renders every phase-1 entry **in full**: a record's statement, `filled_by`,
  cadence and every column with its unit and description; a rule's, measurement's or note's full
  statement and home. Today: one line, statement cut at 200 characters. `RECORDED_BUDGET`
  20 000 → 120 000.
- A transcript unit is checked by `fits` against a budget of its own, `PHASE2_IN_BUDGET = 210 000`
  (excerpt 70K + recorded 120K + cards), not the 50K core a form unit is checked against — else every
  70K excerpt would split again. `MAX_LINES` and `MAX_LINE` stay.
- The input names the run's own department's process file to read whole (no other departments).

## 6. Grouping the photos (Stage G)

Between Prepare and Plan, when the department has photos. The playbook lists the department's
photos (`departments/<dept>/attachments/*.{jpg,jpeg,png}`) and dispatches `quantify` with
`mode: group`, that list as `photos`, `run_dir`, and `schema_path` =
`schemas/photo-groups.schema.json`. The agent reads each photo's extracted description (the
`.text/<name>.image.md` beside it), may open the images, and writes `{run_dir}/photo-groups.json`:

```json
{"schema_version": 1,
 "groups": [{"photos": ["departments/preparation/attachments/photo-A.jpg",
                        "departments/preparation/attachments/photo-B.jpg"],
             "why": "همان سربرگ، ادامهٔ جدول در عکس دوم"}]}
```

`why` is for the run's record; the owner never sees it. A photo with no partner is a group of one.
`facts-plan status` reports Stage G as done when the file exists or the department has no photos.
A department with no photos skips the stage.

## 7. What the agent is told (`quantify.md`)

**Phase 1 (workbook and attachment units).**
- Read `input.md`, then the run's own department's process file whole (paging with `offset`/`limit`),
  then any other department's file where the table's items or columns appear. `Grep` is added to the
  agent's tools for that search, and it searches only `{run_dir}/processes/`.
- The table's columns, rows, printed titles and units come from the sheet or the photo, as today.
  Who fills it and approves it, when, how each value is measured, the exceptions, and whether a
  printed column is still filled come from the processes, which win over the form on all of these.
- A printed column the processes say is no longer filled stays; its `description` says so and where
  the value is written now.
- A condition on an edge («بعدی: … — در صورت …») is an exception of the step it leaves; when that
  step fills or measures something in the table, the condition is written as that entry's exception.
- Two processes that disagree: neither side is written as fact; a `note` on the table asks which is
  right (`about` = the table, `question` = the two sides in Persian).
- Match processes to the table by its items and columns, not by its name.
- Deliver, per table: what it is and who fills and approves it, how often; for each column how it is
  filled — in the field's `description` or as a measurement whose `writes_to`/`home.field` names it;
  the rules (formulas, thresholds, constants) and exceptions, homed on the table.
- Every entry cites the node(s) it came from in `processes[]` with a short quote. No `voice`.

**Phase 2 (transcript units).**
- Read the excerpt, the department's process file whole, and «آنچه تا کنون ثبت شده» (now in full).
- Write only what neither the processes nor phase 1 say, as `new[]` entries homed on a listed table.
- Never write an `account`. A statement that contradicts a process or a phase-1 entry goes to the new
  `contradicted[]` list instead:

```json
"contradicted": [{"claim": "کنار شنیسل خام تنها برای غذای پرسنل مصرف می‌شود",
                  "ref": "meetings/transcripts/preparation-1405-06-04.txt", "lines": "210-218",
                  "against": {"process": "preparation-012", "node": "preparation-012-n039"}}]
```

  `against` is either `{process, node}` or `{"ref": "<handle>"}` of a phase-1 entry. `claim` is
  Persian and passes the style lint.

**Group mode** — §6.

**Review mode.** When two entries are the same thing, the one kept is chosen form > process >
transcript (today form > voice = process = chat).

The «Form first» paragraph's voice-account instruction, the talk-citation rules and the «never open a
process file» line are removed.

## 8. Assembly

- **Node index.** A `processes[]` citation is checked against every department's active nodes
  (`process_index` over all departments), not only the run's.
- **`contradicted[]`** is gated like a citation (the lines inside the unit's own excerpt; `against`
  names a live node or a handle of this run; otherwise that member is dropped with a run-only note)
  and collected into `assembly.json` as `contradicted[]` with the unit id.
- **A `voice` account** written by any unit is ignored with a run-only note.
- **Cross-unit merge keeper** (`_cross_unit`): sorted by source rank (sheet/photo/pdf/docx, then
  process, then voice/chat), then unit id — today by unit id alone, which lets `u-tr-…` beat
  `u-wb-…`.
- **Only judgeable disputes become accounts.** One predicate over the path decides, used by both
  writers of accounts (`_cross_unit` and the review's `account` resolution): a leaf named `title`,
  `type`, `expr`, `lang` or `key`, and anything under `inputs[]`/`outputs[]` except `value`, `range`,
  `unit` and `per`, is not judgeable. For those the keeper's value stays and the other side is
  recorded as a run-only flag. Everything else (who, when, cadence, values, ranges, units, `per`,
  statements) is asked as today.

## 9. The report

After everything the report prints today, and only when `contradicted[]` is non-empty:

```
کنار گذاشته شد چون با فرایندها یا ثبت‌های همین اجرا نمی‌خواند:
  • گفت‌وگوی ۱۴۰۵/۰۶/۰۴: «کنار شنیسل خام تنها برای غذای پرسنل مصرف می‌شود» — فرایند «…»، گام «…» خلاف آن را می‌گوید.
  • گفت‌وگوی ۱۴۰۵/۰۵/۲۸ (۲): «…» — با «<title of the phase-1 entry>» نمی‌خواند.
```

The recording is named by `_recording_label`, a node by its process's name and its label, a phase-1
entry by its title — no id, path or line number. The «اختلاف» section shrinks by §8 alone.

## 10. Model

Every Claude agent runs `claude-opus-5-5` at effort **high**. Opus 5.5 is natively 1M in Claude
Code: on the laptop's CLI (2.1.284) the plain id reports `contextWindow: 1000000` and
`maxOutputTokens: 128000` (probe, 2026-09-29) — the `[1m]` suffix Opus 5 needed is not used. Opus 5.5
defaults to effort `medium`, so the level is set explicitly everywhere (Claude Code docs: subagent
frontmatter `effort`; main session `--effort` > `CLAUDE_CODE_EFFORT_LEVEL` > settings `effortLevel`):

- the frontmatter of `classify`, `consolidate`, `extract`, `summarize`, `quantify`:
  `model: claude-opus-5-5` and `effort: high`;
- the bot's main session: `CLAUDE_MODEL=claude-opus-5-5` and `CLAUDE_CODE_EFFORT_LEVEL=high`, side by
  side (local `deploy/local/control-bot.env`, gitignored; server `/opt/inja/secrets/control-bot.env`,
  at deploy) — unless the bot launcher passes an `--effort` of its own, which is checked first;
- the Claude Code pin in `deploy/control-bot.Dockerfile` (2.1.220) raised to the laptop's 2.1.284.

Proof, inside a container built from the new image: `claude -p "say OK" --model claude-opus-5-5
--output-format json` reports `contextWindow: 1000000`, and one scratch subagent declaring the same
frontmatter runs on `claude-opus-5-5`. Gemini (transcription, photo reading) is not touched.

## 11. Isolation while this is built

- Code: worktree `.claude/worktrees/facts-src`, branch `worktree-facts-src`, own `.venv`.
- Data: a **clone** of the data-repo (not a worktree) beside it, plus copies of the gitignored
  `.xlsx` files and the photos — nothing is written into the shared `data-repo/.git`.
- Docker: a separately tagged control-bot image and a container of its own (no Telegram, no ports),
  mounted on the clone. The running local test bot and panel are not rebuilt, restarted or recreated.
- Nothing merges into either `main`, is pushed, or reaches the server without the owner's word.

## 12. Acceptance

A headless preparation run in the isolated container, on the clone, with preparation's facts reset to
the seed, on Opus 5.5. It passes only if:

1. raw schnitzel sides are **not** staff food; they only become cooked pizza chicken;
2. burger has **one** form — «نیمه ساخته برگر» on top, «تبدیل برگر» below;
3. the beef-loin conversion form's **Philadelphia** column is no longer filled; Philadelphia goes on
   the semi-finished form;
4. the **supervisor** fills the spider Excel daily from each line's notebook;
5. the spider Excel's **dough** section is not fillable from preparation; flour in and dough out are
   recorded nowhere;
6. the report has no Latin, formula or id, and the «کنار گذاشته شد» section appears when anything
   was set aside;
7. every photo is read by exactly one unit and every sheet tab has its own unit.

Plus: `facts-plan preflight` exits 0 for all nine departments; one short `process-voice` run on the
clone produces valid process output on Opus 5.5. The report and the seven results go to the owner
before anything is merged.

## 13. Rollout (on the owner's word)

Trigger the server's git-push (`docker exec inja-food-process-git-push-1
/usr/local/bin/git-push-if-needed.sh`), merge both branches, push; the server pulls, rebuilds the
control-bot image, sets `CLAUDE_MODEL`; containers recreated while the bot is idle; preparation's
facts on the server reset to the seed after a bundle; the tester runs preparation from zero.

## 14. Out of scope

A per-column coverage check (ruling 5); carrying the hand-made entries over (ruling 8); any UI change
(the panel already labels each source's type); other departments' runs; Gemini; process
confirmation as a filter (ruling 1).

## 15. Risks

- **Reading cost.** ~190K tokens re-read by every agent; accepted (ruling 9). Paging adds turns, most
  of them cache reads.
- **`Grep` reaches beyond the process files.** The card restricts it to `{run_dir}/processes/`; a
  phase-1 unit is shown no transcript, so a `voice` citation from it is dropped by the gate as today.
- **A wrong photo grouping.** Two half-tables or one merged unit; the unit may write two records and
  a person merges or moves entries through the bot. Never a stop.
- **Processes that repeat each other** (`preparation-012` and `-013` both describe schnitzel sides)
  surface as notes asking which is right, not as silent picks.
