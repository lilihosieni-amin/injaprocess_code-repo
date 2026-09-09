# 07 — Quantitative facts: bootstrap, confirmation, and handover

The facts store (`data-repo/facts/`) holds the estate's definitions — units,
constants, records, rules — built from the Google Sheets estate, paper forms
and meeting transcripts by the `quantify`/`edit-fact` playbooks (design
`docs/superpowers/specs/2026-09-06-quantitative-facts-v3-design.md`). This
runbook is the operator's side of it: placing the estate, bootstrapping the
store, seeding the confirmations that have no reviewer to click them yet, and
handing a scope over when it is done.

Every `merge`/`dump-workbook`/`validate`/`allocate-id` call below runs where
the engine CLIs actually live — baked into the `control-bot` image outside
`/data` (see `05-operations.md`'s AC-7 section) — so the pattern throughout is
`docker compose exec control-bot sh -c 'DATA_ROOT=/data <command>'` from
`/opt/inja/code-repo/deploy`. `control-bot`'s compose environment does **not**
set `DATA_ROOT` (only `APPROVED_DIRECTORY`, for the agent's own confinement),
so it has to be given on every manual call.

## 1. Where the store lives, and what commits it

```
data-repo/
  facts/
    .id-seq.json       the global F- ledger (QF-21)
    .index.json         one row per entry, rebuilt on every write
    items.json  records.json  measurements.json  rules.json  notes.json
    originals/{id}.txt  verbatim formula/script bodies, out of line
  attachments/sheets/
    manifest.json        the one description of the estate (Appendix B)
    NAMED_FUNCTIONS.md  _LOG.md
    .dump/{spreadsheetId}/…      dump-workbook's structure output (committed)
    {workbook dir}/
      {name}.xlsx                the workbook itself — NOT committed (below)
      {name}.structure.md  {name}.gs
  runs/facts/{dept}/{stamp}/     one facts run: meta.json, facts-delta.json,
                                  id-map.json, validate output
```

`facts/` is written **only** by `merge facts` — never hand-edit those five
files or `.index.json`. `attachments/sheets/**/*.xlsx` is in `.gitignore`:
the workbooks are deployment assets placed by hand and carry daily values and,
in places, named staff, on the same precedent as `meetings/audio/`. Everything
else under `attachments/sheets/` — the manifest, `.structure.md`, `.gs`,
`NAMED_FUNCTIONS.md`, `_LOG.md` and the `.dump/` output — is committed; those
are structure and definitions, not nightly values.

The facts pipeline's commit (the `quantify` playbook's stage 6, and
`edit-fact`) stages `departments runs facts attachments` — **never `git add
-A`**. This widens the process side's existing allowlist (`departments
runs`, `05-operations.md`'s "Off-site backup" section and `ARD.md` §15): a
facts run also writes under `facts/` and, the first time it touches a given
workbook, under `attachments/sheets/`.

## 2. Placing the sheets estate, and the first dump

The estate arrives as an export (one directory per workbook, a
`NAMED_FUNCTIONS.md`, an `_LOG.md`) and is placed **by hand** — there is no
upload path for it, on purpose (QF-3): the bot never sees the estate, so a
form photograph still has to go through it as a file, but the workbooks
themselves are copied straight onto the server.

```bash
# on the host, as the estate export is received:
mkdir -p /opt/inja/data-repo/attachments/sheets
# copy the export's workbook directories, NAMED_FUNCTIONS.md and _LOG.md in:
cp -r <export>/* /opt/inja/data-repo/attachments/sheets/
```

Then dump every workbook's structure and let `dump-workbook` fill the
manifest's mechanical columns (`spreadsheetId`, `dir`, `file`, `short`,
`scripts`) — nothing a person has to judge yet:

```bash
docker compose exec control-bot sh -c \
  'DATA_ROOT=/data dump-workbook --init-manifest'
```

This prints one `{spreadsheetId}\t{file}\t{N} tabs` line per workbook and
finishes with `manifest: {N} workbooks, {M} awaiting Gate M`. It is
idempotent — rerun after adding more workbooks, it appends rows for the new
files with `confirmed: false` and leaves every already-confirmed row alone.
A workbook file on disk with no manifest row, or an unconfirmed one, blocks
`--manifest` (the pass after Gate M) later, but never `--init-manifest`
itself.

Gate M — proposing `departments`, `branches` and `reference_tabs` for each
new row and confirming them — is the `quantify` playbook's own checkpoint
(§13 of the design), driven in chat, not a manual CLI step; this section's
job ends at getting the files in place and the mechanical columns filled.

## 3. Bootstrap order — the units record first, in a run of its own

`apply` resolves a `unit` field against the **store**, not against the delta
it is applying, so the `units` record has to exist before any other entry
that cites a unit is ever applied — an efficiency ordering for everything
else in the bootstrap, but a correctness requirement for this one record
(design §13). Run it alone, before the first `quantify` run that writes any
other fact:

1. **Validate the delta first.** Copy the complete units-record delta below
   into a file under the data-repo bind mount (anywhere reaches `/data`
   inside the container — a scratch `tmp/` at the data-repo root is fine, it
   is never on the commit allowlist so it cannot leak into a commit by
   accident), then validate it before applying:

   ```bash
   docker compose exec control-bot sh -c \
     'validate facts-delta /data/tmp/units-delta.json'
   # OK: /data/tmp/units-delta.json conforms to facts-delta.schema.json
   ```

   (`validate` needs no `DATA_ROOT` — only `SCHEMA_DIR`, already baked into
   the image at `/opt/schemas`.)

2. **Apply it in its own run**, under `management` (QF-43 seeds the
   universal facts there):

   ```bash
   docker compose exec control-bot sh -c \
     'DATA_ROOT=/data merge facts apply \
        --delta /data/tmp/units-delta.json \
        --run /data/runs/facts/management/20260901-030000'
   # created F-00001
   ```

   The run directory does not need to be created by hand — `apply` makes
   it. On a store that already has entries (this is not the very first
   facts run), the printed id is whatever the ledger's next `F-` number is,
   not necessarily `F-00001`.

The complete units-record delta (design §10, QF-40 — `g, kg` mass; `ml, l`
volume; `pcs, slice, portion` count; `carton, pack` pack-level, whose
`factor_to_base` is `null` because it is per item; `min, hour, day`
duration; `irr` money; `percent, ratio` dimensionless):

```json
{
  "schema_version": 1,
  "entries": [
    {
      "id": "T-1",
      "kind": "record",
      "key": "units",
      "title": "واحدها",
      "statement": "جدول واحدها — رجیستری نمادها، بُعد، ضریب تبدیل به واحد پایه و عنوان فارسی هر واحد",
      "scope": { "departments": [], "branches": [] },
      "source": [ { "type": "chat", "ref": null } ],
      "retired": false,
      "data": {
        "medium": "native",
        "role": "config",
        "location": {},
        "primaryKey": ["symbol"],
        "fields": [
          { "key": "symbol", "title": "نماد", "type": "string" },
          { "key": "dimension", "title": "بُعد", "type": "string" },
          { "key": "factor_to_base", "title": "ضریب", "type": "number" },
          { "key": "unit_title", "title": "عنوان", "type": "string" }
        ],
        "rows": [
          { "key": "g", "symbol": "g", "dimension": "mass", "factor_to_base": 1, "unit_title": "گرم" },
          { "key": "kg", "symbol": "kg", "dimension": "mass", "factor_to_base": 1000, "unit_title": "کیلوگرم" },
          { "key": "ml", "symbol": "ml", "dimension": "volume", "factor_to_base": 1, "unit_title": "میلی‌لیتر" },
          { "key": "l", "symbol": "l", "dimension": "volume", "factor_to_base": 1000, "unit_title": "لیتر" },
          { "key": "pcs", "symbol": "pcs", "dimension": "count", "factor_to_base": 1, "unit_title": "عدد" },
          { "key": "slice", "symbol": "slice", "dimension": "count", "factor_to_base": 1, "unit_title": "برش" },
          { "key": "portion", "symbol": "portion", "dimension": "count", "factor_to_base": 1, "unit_title": "پرس" },
          { "key": "carton", "symbol": "carton", "dimension": "pack", "factor_to_base": null, "unit_title": "کارتن" },
          { "key": "pack", "symbol": "pack", "dimension": "pack", "factor_to_base": null, "unit_title": "بسته" },
          { "key": "min", "symbol": "min", "dimension": "duration", "factor_to_base": 1, "unit_title": "دقیقه" },
          { "key": "hour", "symbol": "hour", "dimension": "duration", "factor_to_base": 60, "unit_title": "ساعت" },
          { "key": "day", "symbol": "day", "dimension": "duration", "factor_to_base": 1440, "unit_title": "روز" },
          { "key": "irr", "symbol": "irr", "dimension": "money", "factor_to_base": 1, "unit_title": "ریال" },
          { "key": "percent", "symbol": "percent", "dimension": "dimensionless", "factor_to_base": 0.01, "unit_title": "درصد" },
          { "key": "ratio", "symbol": "ratio", "dimension": "dimensionless", "factor_to_base": 1, "unit_title": "نسبت" }
        ]
      }
    }
  ]
}
```

After the units record, the rest of the bootstrap is ordinary `quantify`
runs, in this order so cross-workbook references resolve to real records
instead of piling up stubs:

1. The universal seeds under `management` (the Jalali/`GREG_TO_JALALI`
   family and any other fact with no branch- or department-specific
   referent, QF-43) — one `quantify` run, still under `management`.
2. Station and warehouse workbooks.
3. Sales and ingredient workbooks.
4. The report workbooks last (`Gozaresh markazi` and its siblings pull from
   all of the above through `IMPORT_FROM_SHEET`).

Each of those is a normal `quantify` playbook run (Gate A, the facts
checkpoint, `merge facts apply`, the commit) — not a hand-written delta; only
the units table is seeded by hand, because it is the one record with no
artefact behind it (`medium: native`).

## 4. Seeding the universal confirmations at `*` (پس از فاز ۳ / available after Phase 3)

**This section documents a procedure the confirmations API does not yet
serve for facts** — `routers/confirmations.py` gains a facts loader in
Phase 3 (design §16). It is written against the contract that route already
implements for processes today (`ui-backend/inja_ui_backend/routers/
confirmations.py`): the target is the entry id, the caller echoes back the
fingerprint it was shown, and a stale echo answers 409. Once Phase 3 ships,
substitute the real fingerprint source (the facts list/detail screen, or
whatever route Phase 3 lands) for step 2 below.

QF-27: a fact scoped to no department (`scope.departments == []`) needs
`confirm` at the wildcard scope `*` — held today by the Editor `inja-seed`
creates (`06-changing-users.md`), whose one scope row is `*`.

1. **Sign in** as that Editor and keep the session cookie:

   ```bash
   curl -sS -c /tmp/inja-cookies.txt -X POST https://<host>/api/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"username": "<editor-username>", "password": "<password>"}'
   ```

2. **Find the universal-scope ids** — the units record from §3 and any
   universal rule the management bootstrap run wrote (the Jalali family) —
   straight out of the index the bootstrap run just produced:

   ```bash
   jq '.entries[] | select(.scope.departments == [] and .scope.branches == [])
       | .id' /opt/inja/data-repo/facts/.index.json
   ```

   For each id, read its current fingerprint from wherever Phase 3 serves it
   (the facts detail screen, or its `GET` route) before confirming — the
   confirmation has to echo the fingerprint of what was actually read, never
   a guess.

3. **Confirm it**, echoing that exact fingerprint:

   ```bash
   curl -sS -b /tmp/inja-cookies.txt -X POST https://<host>/api/confirmations/F-00001 \
     -H 'Content-Type: application/json' \
     -d '{"fingerprint": "<the fingerprint step 2 showed you>"}'
   ```

   `200` with `"confirmed": true` means it stuck. `409` means the entry
   moved since you read it (another run touched it, or you copied the wrong
   fingerprint) — re-read the fingerprint and retry. Repeat step 3 for every
   id step 2 listed.

## 5. Readiness — what `check` reports

```bash
docker compose exec control-bot sh -c 'DATA_ROOT=/data merge facts check'
```

`check` reports a department's **readiness** (QF-44 v3) as its last stdout
line — five answers, and no workbook denominator:

```
readiness: units_done=True review_ran=True lint_failures=0 expr_missing=0 open_disputes=0
```

Every unit of the last run is done; the review ran; no entry carries a lint
failure; no rule bound to a formula is missing its expression; no dispute is
still open. The last three are counts, so the ready state is `True True 0 0 0`.

**The coverage line is gone**, and deliberately (v3 design §11, cause C —
`docs/superpowers/specs/2026-09-06-quantitative-facts-v3-design.md`). It read
`coverage: {n} of {m} workbooks read` and counted a workbook as read the moment
one non-stub record cited it — which made "read the whole estate" a target and
"mint a record per tab" the cheapest way to hit it. 486 entries later, the
metric was measuring the defect. What replaces it is the run's own state: a
department is ready when its units are done and its output survived review, and
a workbook nobody had anything to say about is a fine outcome. (The workbook
nothing cites is still *reported*, as an `uncited_workbook` finding — a line to
read, never a denominator to close.)

`merge facts repair-foreign-keys` is retired with the same change: `foreignKeys`
is gone from the payload vocabulary, replaced by `imports[]` and
`fields[].refItems`, so there is no collection left for it to repair.

Every `check`/`audit` line is a finding for a human, not a failure — both verbs
exit 0 whatever they found.

## 6. Undoing a run

```bash
docker compose exec control-bot sh -c \
  'DATA_ROOT=/data merge facts revert --run /data/runs/facts/cooking/20260901-101500'
```

`revert` removes every entry the run created and restores every entry it
touched from the snapshot taken right before it wrote (`{run_dir}/
facts-before/`); a supersession's predecessor reopens automatically. It
refuses (exit 2, nothing written) if any **later** run's delta touched one
of the same entries — revert the later run first.

**A run that adopted a workbook stub (QF-20) cannot be reverted at all.**
Adopting a stub overwrites its id's key and scope in place and re-derives
every measurement keyed through it, so there is no entry-level undo for it;
`revert` refuses outright rather than half-restoring, with:

```
precondition failed: run adopted workbook stub F-00042; revert cannot
restore an adoption — revert the data-repo commit instead
```

— which is exactly the recommended recovery: `git revert`/`reset` the
data-repo commit that run made, past the point of no `merge facts` undo.

Reverting a chat run also forgets the confirmation rows it wrote (§13).

## 7. Readiness and handover

A scope (a department, a branch, or the whole estate) is ready to hand over
when, restricted to that scope (QF-44):

1. **`merge facts check` reports the scope ready** — every unit of its last run
   done, the review run, no lint failure, no rule missing its expression, no
   dispute still open (§5). Not a workbook count.
2. **Every non-retired entry in scope is confirmed.** A reviewer's tick, and
   nothing else.

   **Redness is not part of this test** — owner ruling, 2026-09-06: «whatever
   gets confirmed means it's complete, period. Whether it's red or not
   shouldn't matter at all.» This step used to read "every entry is green" and
   list the `disputed`/`unknown` query below, which was the right test only
   while a red entry could not be ticked at all. It can now, and a red leaf is
   an unanswered question about the SOURCE — some of which are simply how the
   restaurant is, and would make handover wait on facts that will never
   resolve. The reviewer who ticks an entry with a red leaf has read that leaf
   and is saying this is what the source says.

   Read the confirmations off the Panel (§4), which is where a tick lives —
   `facts/.index.json` carries no confirmation state, so there is no `jq` for
   this one.

   The red counts are still worth *looking* at before you tag, not as a gate
   but so a scope never hands over with open questions nobody knew about:

   ```bash
   jq '.entries[] | select(.retired == false)
       | select(.status == "disputed" or .status == "unknown"
                 or (.field_status_counts.disputed // 0) > 0
                 or (.field_status_counts.unknown // 0) > 0)
       | {id, key, status}' \
     /opt/inja/data-repo/facts/.index.json
   ```

Once both hold, the handover artefact is a **git tag** on `data-repo`, at the
commit that carries everything the scope needs — `facts/`, `attachments/
sheets/` (the manifest, the dumps, the `.gs` files, the `.structure.md`
files) and the `runs/facts/{dept}/{stamp}/` directories that produced them —
named in the tag's own message, since a tag cannot itself restrict which
paths it covers:

```bash
git -C /opt/inja/data-repo tag -a facts-handover-<scope>-$(date -u +%Y%m%d) -m \
  "facts/, attachments/sheets/ (manifest, .dump/, .gs, .structure.md), and
   runs/facts/<dept>/<stamp>/ … as of this commit — <scope> handover"
```

The `.xlsx` files themselves are never in the tag — they are gitignored
(§1) and server-local. Copy them alongside the tagged checkout by hand from
the live `attachments/sheets/` tree, or from its off-site snapshot once the
`state-backup` service covers it (`05-operations.md`'s Backup & restore
section already lists `attachments/sheets/` as a server-snapshot item for
exactly this reason).

## 8. Comments review — cell-comment authorship

`dump-workbook` writes every sheet cell comment to `comments.tsv` with its
author reduced to a **role**, never a display name — the `personId` a
threaded comment carries is looked up in a role table the caller supplies,
and anyone absent from it, or absent from any table at all, comes back
`unknown` (Appendix C; `dump_workbook`'s own `roles=` keyword).

**Today the CLI wires no role table at all**, so on the real estate every
comment author reads `unknown` — a known state, not a bug: Task 10's run
over the full 28-workbook export found 102 comments, and all 102 came back
`unknown` author. There is no `--roles` flag on `dump-workbook` yet; the
table only exists as a keyword argument on the Python `dump_workbook(...)`
call.

What to do about it:

- **If comment authorship needs to matter** (a warehouse cell comment
  carrying a yield decomposition is a case the estate actually has), the
  role table has to be supplied or extended at the call site — today that
  is a code change (`dump_workbook(..., roles={personId: "role", …})`),
  not an operator-facing switch. Note it for whoever owns `engine/` if a
  reviewer keeps needing to know who wrote a given comment.
- **Otherwise, review comment-derived facts as they are.** An entry (or an
  open account) whose `source[].type` is `comment` will normally carry
  `speaker_role: null` — that is the honest state of the source, not a
  missing field to chase down. Where the identity of the commenter
  genuinely matters, the comment/transcript text itself, reached through
  `source`, is the sanctioned place to look (ARD's "roles, not names"
  rule) — never a display name written into the fact.

## 9. Deliberate ceilings (سقف‌های عمدی)

Two ceilings from the design (§18) have no code site to carry a `ponytail:`
comment, so this file is their only documentation:

- **No canvas badge for facts.** `src/flow/**` stays frozen — it is shared
  with the department PDF export, and facts get no marker on a flowchart
  node. A fact's link to a process is discoverable the other way round: its
  reverse index («استفاده‌کنندگان») on the fact's own detail view, once the
  Panel ships (§4).
- **Facts are not a comment target.** FR-K1's four targets stand as they
  are — a process step, a whole process, a department's process list, a
  department's information page — and gain no fifth. A reviewer who finds a
  gap while reading a fact closes it as an editor working from the facts
  list (resolving a dispute, filling an `unknown`, editing through
  `edit-fact`), not by leaving a comment on the entry.

## 10. Before a facts run — the pre-run checklist (v3 design §6.1)

On the **server** the control bot's environment already carries all of this and
there is nothing to do. On a **laptop**, in a Claude Code terminal, four things
have to be true before Stage U dispatches its first unit, and three of them were
not true during the 2026-09-02 run:

```bash
# (a) a unit takes minutes; a backgrounded one is a lost unit (ADR 0006)
export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1

# (b) the ponytail plugin's SubagentStart hook injects a coding-minimality
#     persona into EVERY subagent while this flag exists, and its matcher is an
#     opt-in allowlist that fails open — so removing the flag is the only fix.
rm -f ~/.claude/.ponytail-active     # or: export PONYTAIL_DEFAULT_MODE=off
test -f ~/.claude/.ponytail-active   # must exit 1 — the playbook checks this too

# (c) the model, with the suffix. Plain `claude-opus-5` silently gets 200K.
grep -n 'model:' ../data-repo/.claude/agents/quantify.md
#   model: claude-opus-5[1m]
```

(d) the playbook uses only `Read, Write, Edit, Bash, Glob, Grep, Task` — the
bot's own allowlist — so nothing authored on the laptop breaks on the server.

Two more items joined the list on 2026-09-07, and neither is a check to
run: they are rules the engine now enforces, listed here because the
console is where someone would try to work around them.

(e) two rules of the run are the **engine's**, not the operator's, and neither
is liftable from the playbook or from this checklist (design addendum
2026-09-07, §3.5): a unit gets **two attempts per run** — `validate facts-unit`
refuses a third output with `out.3.json: attempt cap: two per run`,
`facts-plan status` reports that unit `failed`, and `assemble` continues without
it — and `yield: true` **ends the turn**: the coordinator sends its progress
line and stops. A request to lift either is a bug report, not a decision to take
at the console.

(f) the guard hook blocks driving the engine from Python: a `python`,
`python3` or `uv run python` invocation that imports `facts_plan`, `merge_facts`
or `engine_common`, or runs a script under `runs/`, is refused with one message.
The seven engine CLIs — `facts-plan`, `validate`, `merge`, `dump-workbook`,
`extract-attachment`, `transcribe`, `allocate-id` — stay allowed, and they are
the only way in.

For a run through the **local test bot**, check the same flag inside the
container: `/root/.claude` there is a volume seeded from the host's `~/.claude`,
so a flag file on the laptop reaches the container with it.

```bash
docker compose -f docker-compose.local.yml exec control-bot \
  test -f /root/.claude/.ponytail-active     # must exit 1
```

### Before a department's FIRST run — `facts-plan preflight` (added 2026-09-08)

Every run before 2026-09-08 was cooking's, and the engine's own candidates for the
other eight departments had never been through the engine's own gate. Two of them
could not even plan (their twin workbooks were not marked as twins — cooking's had
been marked by hand). The pre-flight is the deterministic half of a first run,
costs no model time, writes nothing under `DATA_ROOT`, and must exit 0 before a
department's first `/quantify`:

```bash
docker compose exec control-bot sh -c \
  'DATA_ROOT=/data facts-plan preflight accounting'
# {"candidates": {"record": 6, "rule": 1}, "engine_refused": 0, "unit_owed": 2, "units": 1}
```

It builds the run into a scratch directory, pushes every engine-built candidate
through `validate facts-unit` with the smallest decision a unit could write, and
reports two counts: `unit_owed` — refusals the unit will answer (a rule's
inputs, a Persian title for a script's name) — and `engine_refused`, which must
be 0. A non-zero `engine_refused` is an engine defect (a shape the engine built
and the engine refuses, the class that killed the raw-materials unit in every
cooking run until the rows followed the fields' renames); its lines go to
stderr grouped by rule with one example each, and the verb exits 2. Pass
`--recordings a,b` to include transcript units, as `build` does. On 2026-09-08
all nine departments exited 0.

### When a run stops, and when it does not (I5, added 2026-09-08)

On 2026-09-08 one unfinished table cost the owner a whole run. **A run now
stops only when nothing at all can be assembled.** Every other refusal names
one candidate or one entry, holds *it* back, and the rest of the run lands in
the store. The held-back list is `assembly.json`'s `undecided[]`, and the owner
reads it grouped by reason at the end of `report.md`.

| where | what it does | the owner sees |
|---|---|---|
| a unit is over budget with no axis left to split on | its largest candidates are set aside, largest first, until the unit fits | «کنار گذاشته شد: بزرگ‌تر از یک واحد» in `gate-b.md` and `report.md`, naming each table |
| two units point `merge_into` at each other | every candidate on the cycle is held back | «به هم ارجاع می‌دادند و هیچ‌کدام مقصد نبود» |
| a candidate merges into a target no unit kept | the merger is held back naming what it waited for | «موردی که در آن ادغام می‌شد ثبت نشد» |
| an entry cites an `F-` id no store entry carries | the entry is held back, and whatever cites it waits with it | «به موردی ارجاع می‌داد که در سامانه نیست» |
| an entry fails the assembly's own lint (step 8) | the entry is held back, dependants with it | «با قرارداد ثبت جور در نیامد» |
| an entry cites a candidate a unit dropped or never decided | the entry waits for it | «منتظر بخشی است که در این اجرا تمام نشد» |
| a unit spent both attempts and returned nothing usable | its candidates are held back | «در این اجرا بررسی نشد» |
| `assemble` — a review decision fails the lint or an address lands nowhere | that decision is held back (`review_held`) and named in the report; the rest of the review applies | «بازبینی انجام شد؛ ۱ تصمیم آن کنار گذاشته شد:» and the entry's title with its reason |

Eight stops remain, and none of them is one input's fault:

| stop | why it stays |
|---|---|
| `build` — a candidate planned into two units or into none | an engine invariant; a candidate decided twice contradicts itself and one decided nowhere is lost work |
| `facts-plan build` without `--rebuild` once a unit is done | protects finished work; resume through `facts-plan status` |
| `assemble` — a unit's latest output does not validate and it still has an attempt | the run is not ready; Stage U re-dispatches that unit |
| `digest` — the digest is over the 400 K ceiling | no reviewer can read it, and a run recorded without a review is not an outcome the design allows; report it as a defect |
| `assemble --review` — the review was written against an older digest | its addresses no longer name what they meant; the playbook re-enters Stage R and the review is written again, never skipped |
| `assemble` — a `review: <key>` lint line no review decision owns | a defect in the fold: with nothing to hold back the loop would spin; the line is printed as it is |
| `assemble` — a lint failure that pins to no entry, or one that would hold back every entry | there is nothing left to land, and a hold-back that empties the run is the run failing; every line is printed |
| `assemble` — nothing at all could be assembled | the one true stop; every held-back reason is printed |

A new `raise SystemExit(2)` in `build.py`, `assemble.py`, `cli.py` or
`preflight.py` fails `test_only_the_stops_the_design_keeps_are_left` until this
table gains a row.

### The estate's own spellings — `conventions` in the manifest (I6, added 2026-09-08)

Nothing in the engine knows this estate's branch names, its `##`/`#` item-code
namespaces, its `Column N` placeholder headers, its month names or its `Table_`
prefix any more. They are one optional object in
`attachments/sheets/manifest.json`:

```json
"conventions": {
  "branch_tokens": ["چاله باغ", "naharkhoran"],
  "code_namespaces": {"##": "ing", "#": "food"},
  "placeholder_header": "^Column [0-9]+$",
  "month_names": ["فروردین", "…"],
  "table_prefix": "Table_"
}
```

Every member is optional and an absent one falls back to today's value, so a
manifest written before 2026-09-08 keeps working unchanged. Four rules are
worth knowing at the console:

- **Stage 1 writes it.** `dump-workbook --init-manifest` puts the effective
  object into a manifest that carries none, and never rewrites one it finds —
  it is an answer, like a judgement column. Editing it by hand is how an estate
  differs; only the members that differ need to be there.
- **`branch_tokens` is derived, not written.** Stage 1 runs before Gate M
  declares a single branch, so `--init-manifest` deliberately writes no token
  list: the tokens come from `branches[]` — each code and name, with and
  without the space and the ZWNJ, lower-cased — plus today's spellings, and
  they follow every branch the owner declares afterwards. A `branch_tokens`
  written into the manifest **overrides** that derivation and is then the whole
  list, so declare one only for a spelling the branch names do not carry.
- **An empty `table_prefix` means «this estate names no tables»** — the table
  alternative is dropped from the three patterns built off it, rather than
  becoming an empty alternative that matched every word (which refused every
  definition the units wrote for naming a table).
- **A namespace is one to three non-Latin, non-digit characters** — the
  manifest schema refuses anything else, because the store schemas do; and a
  `placeholder_header` that is no regex falls back to today's rather than
  raising out of every verb that loads the estate.

## 11. What the owner sees — the message contract

One file, `report.md`, written by the engine and sent **verbatim** by the playbook after the
apply. `gate-b.md` is still written by `assemble` as the run's record of what it proposed, but it
is no longer sent and the run no longer stops for it — owner ruling, 2026-09-09: at the size a
department produces the checkpoint message was not readable, and an apply is reversible (§6).
Neither file carries a command, an account id, an entry id, a path, a unit id, a run
directory or a department code; both name an entry by its Persian **title** and
nothing else — the id the Panel shows in its «شناسه» column never appears in
either file.

| file | written by | sent at | carries |
|---|---|---|---|
| `{run_dir}/gate-b.md` | `facts-plan assemble` | **not sent** since 2026-09-09 — kept on disk as the run's record | counts per kind; the first three rules in one sentence each; how many were dropped and the commonest reasons; how many went unexamined; the disputes numbered with lettered options; how many issues were found in the files, three of them named; how many cells are unanswered; and the one question «تأیید می‌کنید؟» |
| `{run_dir}/report.md` | `facts-plan report` | after the apply and the commit | what was recorded, dropped and left unexamined; the open disputes numbered with lettered options; the unanswered cells grouped per entry; the dropped list by reason in the owner's own words; every engine-found issue grouped by kind; whether a part was left unfinished; and how the review went — applied whole, or applied with the decisions that were set aside named one per line |

A third line runs through both files: **a file this run could not read is named
once.** An extension `extract-attachment` has no converter for, or a supported
file whose cached text is missing or stale, becomes an `unread_attachment` issue
and is listed under «فایل‌هایی که در این اجرا خوانده نشدند» — in `gate-b.md` as
well as `report.md`, so the owner learns at approval time and not only at the
end — beside an unplaced workbook, by the owner-visible name of the file and
never by a path. An `.xlsx` is the dumper's and is named by the workbook line
instead; passthrough text (`.csv`, `.md`, `.txt`, `.gs`) is read directly and is
never "unread". No unit ever sees such a file, and nothing is improvised over it
(design addendum 2026-09-07, invariant I2).

Validator output has the opposite contract and is **never** owner-facing: one
line per distinct rule with the field path — `entries[3].data.fields[2].type:
'text' is not one of ['string','number','integer','boolean','date']`, with the
entry renamed to the decision that wrote it — no entry dumps, and a cap of 80
lines closed by `… and N more`. It is read by the coordinator, pasted into a
re-dispatch, and quoted to nobody.

**No other question is put to the owner at the checkpoint.** Approval applies the
delta with the disputes still open; the owner answers a dispute right there
(«۱ الف») or later in the Panel, and the playbook runs the resolve itself.

The stage table these two sit in is **not duplicated here** — it lives in
`data-repo/.claude/skills/quantify/SKILL.md` ("Stage ordering") and in v3 design
§2.1, and a third copy would be the one that goes stale. What this runbook owns
is the operator's side: the checklist above, and the readiness test in §5 and §7.

Both files are lintable, and the lint is the same one the playbook's own
owner-facing blocks pass:

```bash
cd /opt/inja/code-repo && .venv/bin/python -c "
import sys, pathlib
sys.path.insert(0, '../data-repo/.claude/hooks')
from test_playbook_lint import problems
run = pathlib.Path('../data-repo/runs/facts/cooking/20260906-101500')
for name in ('gate-b.md', 'report.md'):
    print(name, problems((run / name).read_text(encoding='utf-8')) or 'clean')
"
```

`clean` on both lines is the pass; anything else names the token that leaked —
a path-shaped token, an 8-hex id, a department code, or one of the pipeline's
own words.

## 12. The unit gate (design addendum 2026-09-07)

`docs/superpowers/specs/2026-09-07-quantitative-facts-v3-gate-design.md` is the
design; this section is the operator's side of it.

On 2026-09-07 the cooking run assembled 220 entries and the final validation
refused 52 of them — 17 records, 5 measurements, 30 rules — on **shape** alone:
a column type written as `text`, a computed column marked yes/no instead of a
reference, a cadence written in Persian words instead of its enum value, rules
with no inputs or outputs, two paper forms with invented keys and no location.
Nothing was wrong with the content, and by then every unit and the reviewer had
spent their attempts. The store's closed contract was being applied for the
first time after the last gate that could act on it.

**The output side is closed at the unit's gate now.** Whatever a unit writes,
from whatever evidence — a sheet, a transcript, a `.docx`, a `.pdf`, a
photograph, something said out loud — is validated at `validate facts-unit`
against the same per-entry contract `merge facts apply` enforces: the store
contract in its delta form (`facts-delta.schema.json`, which differs from the
store's in carrying `original` where the store carries `original_ref`, in not
requiring `rows[].key` — derived at apply for a reference table, refused at this
gate for every other role — and in leaving out the envelope keys `apply` itself
writes: `id` as a real fact id, `status`, `updated_at`, `source[].hash`/`run`
and `accounts[].id`) and
the content pass, plus a branch code off the sheets manifest, a unit symbol off
the units record, `fields[].from` against the candidate's columns, and a
`merge_into` across kinds. `assemble` re-runs the same contract over the
assembly and over the review's rewrites, whose lines are labelled
`review: <key>` — and such a line now holds back that one decision
(`review_held`) rather than the review. The final validation keeps only what is
genuinely cross-entry — twin titles, instance ownership, references between
units — and each of those already names the unit that caused it.

So the operator's reading of a failure changes: **a per-entry error at the final
validation is a defect in the engine, not a unit to re-dispatch.** Stop the run
before the checkpoint, record the message as it is, and report it. There is
nothing to hand-repair — the delta is the assembly of every unit, and a
hand-edited delta is how the 2026-09-02 run ended.

### Re-validating an existing run under the new gate

`status` re-derives every unit's state from the filesystem, so an older run is
re-judged by simply asking:

```bash
docker compose exec control-bot sh -c \
  'DATA_ROOT=/data facts-plan status --run /data/runs/facts/cooking/20260907-052345'
# u-wb-gozaresh · workbook · failed · 2
# u-tr-r03-l1 · transcript · pending · 1
# stage U · plan_stale false · elapsed_s 0 · yield false
```

`failed` is a unit with two parsing attempts whose latest one the gate refuses;
one attempt and a refusal is still `pending`. The messages themselves come from
the validator, on the failing unit's latest output:

```bash
docker compose exec control-bot sh -c \
  'DATA_ROOT=/data validate facts-unit \
     /data/runs/facts/cooking/20260907-052345/units/u-wb-gozaresh/out.2.json \
     --run /data/runs/facts/cooking/20260907-052345'
# decisions[1] S-r-…: data.fields[2].type: 'text' is not one of [...]
```

A unit at the cap looks the same either way: a third output is refused before it
is read (`out.3.json: attempt cap: two per run`), the unit stays `failed`, and
`assemble` folds the run without it. A unit already at two attempts is re-run in
a **fresh run directory**, never as a third file, and nothing at the console
lifts the cap.

### Giving an already-planned run the shape section

```bash
docker compose exec control-bot sh -c \
  'DATA_ROOT=/data facts-plan build cooking \
     --run /data/runs/facts/cooking/20260907-052345 --refresh-inputs'
# {"over_budget": [], "refreshed": 14}
docker compose exec control-bot sh -c \
  'DATA_ROOT=/data facts-plan digest --run /data/runs/facts/cooking/20260907-052345'
```

`--refresh-inputs` rewrites every `units/<id>/input.md` from the existing
`skeleton.json` and `plan.json` and touches nothing else — never `plan.json`,
never an `out.<n>.json`, never a split — which is what lets a run that has
already spent attempts pick up a card added mid-flight. It is mutually exclusive
with `--rebuild` (that one replaces the plan and renumbers unit directories), and
a unit whose refreshed input no longer fits the budget is *reported* by id: the
decision to split it is the plan author's. `review/input.md` is not this verb's
business — `facts-plan digest` re-renders it.

### Running the playbook headless

The playbook can be driven without Telegram, one turn per `docker exec`, which is
how the 2026-09-07 acceptance run was made. The container name is the one
`docker compose ps` prints (`inja-food-process-local-control-bot-1` locally):

```bash
docker exec -d -w /data \
  -e DATA_ROOT=/data -e SCHEMA_DIR=/opt/schemas \
  -e CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1 \
  inja-food-process-local-control-bot-1 sh -c \
  'mkdir -p /tmp/acc; claude -p "/quantify cooking" --model "claude-opus-5[1m]" \
     --allowedTools Read,Write,Edit,Bash,Glob,Grep,Task \
     --disallowedTools AskUserQuestion,ExitPlanMode,EnterPlanMode \
     --max-turns 200 --output-format stream-json --verbose \
     </dev/null >/tmp/acc/turn-1.jsonl 2>/tmp/acc/turn-1.err; \
   echo $? >/tmp/acc/turn-1.exit'
```

The turn is finished when `/tmp/acc/turn-1.exit` exists; its content is the exit
status, and the transcript is the `.jsonl`. Four rules, all of them learned on
2026-09-07:

- **No permission mode.** `--permission-mode bypassPermissions` is *refused*
  when `claude` runs as root, which it does in this container. Nothing replaces
  it: the bot itself passes only the allowed and the disallowed tool lists, so
  the headless recipe passes none either, and the two lists above are the bot's.
- **Write the stream inside the container.** The redirections belong inside the
  `sh -c`, as above. A host-side `docker exec` client holding the stream open
  was killed for memory twice before the run finished; a container-side file and
  `-d` cost nothing and survive the client.
- **A fresh session after any change to a run's files.** Use `--continue` only
  to answer the question the coordinator has just asked. After anything that
  touched the run — moving a delta, re-validating an output, editing a unit —
  start a fresh session (`claude -p "/quantify cooking"`), because the
  playbook's Stage 0 resumes from disk while `--continue` resumes the
  coordinator's *stale context*. On 2026-09-07 a resumed Gate B context read
  «ادامه بده» as its own approval and tried to apply a delta that was no longer
  there.
- **`/root/.claude.json` is not on the credentials volume.** Recreating the
  container loses that file. It is harmless — `claude` regenerates it — and the
  sessions and the credentials under `/root/.claude` survive, because that path
  is the volume.

Cost, for planning: the 2026-09-07 acceptance run cost about **$29** across six
turns, most of it the fourteen units at their second attempts.

### The bind mount and host-side git

Docker Desktop's `/host_mnt` cache serves a stale `.git/index` and `packed-refs`
to the container after a host-side git operation on the data-repo. **After any
host git operation on the data-repo, restart the control bot before it runs
git**, and verify the state on both sides. **Never run host git on the data-repo
while a bot run is in progress** — the run's commit is the bot's, and a
concurrent host-side operation is how a run ends holding an index nobody wrote.

## 13. Editing through the bot (design addendum 2026-09-09)

When the owner tells the bot to change something that is already recorded —
one word in a statement, a wrong number, a department that should not be on an
entry — the bot does not re-run the pipeline and does not send the owner to the
UI. It writes a patch and calls one verb:

```bash
docker compose exec control-bot sh -c \
  'DATA_ROOT=/data merge facts edit --id F-00150 \
     --patch /data/runs/facts/cooking/20260909-091210/facts-patch.json \
     --run /data/runs/facts/cooking/20260909-091210 --preview'
```

- **The patch** (`facts-patch.schema.json`) is a list of `set` / `remove` /
  `unset` / `append` operations over the same field paths the UI and `resolve`
  use. One entry per call, one run directory per call — a ten-record
  instruction is ten runs, each revertible on its own.
- **`--preview`** applies the patch to a copy, runs every refusal check, writes
  nothing, and prints the current and proposed value of each op. This is what
  the owner is shown before a destructive or composed change.
- **Refusals** are the usual ones: exit 2, `precondition failed: …` on stderr,
  and nothing written at all — no store file, no snapshot.
- **The confirmation is the panel's, and only ever a person's** (owner ruling,
  2026-09-09). A successful edit writes no confirmation of any kind: it stamps
  the entry's `updated_at` and changes its content, so the mark a reviewer had
  stored no longer matches the entry's fingerprint and the panel shows the
  entry «تأییدنشده» again — the same rule a `merge` run on a process has always
  had. The owner re-confirms it in the panel when they have read it there.
- **Undo** is `merge facts revert --run <run_dir>` as for any other run (§6):
  the entry comes back wholesale from `{run_dir}/facts-before/`.

**What is committed.** The five store files and the run directory, as for every
other verb. Nothing else: the edit writes no sidecar of its own.

## Next

See [`05-operations.md`](05-operations.md) for logs, health, and backups, and
[`06-changing-users.md`](06-changing-users.md) for who can hold `confirm`.
