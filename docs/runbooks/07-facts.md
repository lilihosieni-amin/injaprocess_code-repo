# 07 — Quantitative facts: bootstrap, confirmation, and handover

The facts store (`data-repo/facts/`) holds the estate's definitions — units,
constants, records, rules — built from the Google Sheets estate, paper forms
and meeting transcripts by the `quantify`/`edit-fact` playbooks (design
`docs/superpowers/specs/2026-08-29-quantitative-facts-design.md`). This
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

## 5. The coverage line, and what "read" means

```bash
docker compose exec control-bot sh -c 'DATA_ROOT=/data merge facts check'
```

The last line is always `coverage: {n} of {m} workbooks read` — the same
`{n}`/`{m}` the design's coverage line («{n} از {m} کاربرگ خوانده شده»)
renders in the Panel once it ships. "Read" is `check`'s own definition
(design §12):
a manifest workbook counts once at least one **non-stub** `record` in the
store cites it; a workbook present in the manifest but never turned into a
record (or turned only into a stub, QF-20) is not counted, however many
files were placed for it. Every other `check`/`audit` line above the
coverage line is a finding for a human, not a failure — both verbs exit 0
whatever they found.

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

## 7. Readiness and handover

A scope (a department, a branch, or the whole estate) is ready to hand over
when, restricted to that scope (QF-44):

1. **`merge facts check` reports full coverage** — the coverage line reads
   `{n} of {n}`, not `{n} of {m}` with `m > n`.
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

## Next

See [`05-operations.md`](05-operations.md) for logs, health, and backups, and
[`06-changing-users.md`](06-changing-users.md) for who can hold `confirm`.
