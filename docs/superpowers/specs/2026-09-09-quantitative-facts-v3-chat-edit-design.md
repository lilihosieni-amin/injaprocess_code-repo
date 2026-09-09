# Quantitative facts v3.7 — chat edits, and the decision-table row contract

Addendum to `2026-09-06-quantitative-facts-v3-design.md` (v3), `2026-09-07-…-gate-design.md` (v3.4),
`2026-09-08-…-acceptance-fixes-design.md` (v3.5) and `2026-09-08-…-generality-design.md` (v3.6). Where
this file and an earlier one disagree, this file wins.

## 0. What changes, in one paragraph

The owner asked the bot to change one word in the statements of ten records, and nothing changed:
§11's write ladder can only create, fill, dispute, append and union, a prose leaf is filled once and
never rewritten (not even disputed), no member of any list can be removed, `scope` cannot move, and
a mistaken `retire` cannot be undone short of reverting a whole run. The v2 design promised that
"nothing filled is overwritten without a human verb" and never built the verb. This addendum builds
it — `merge facts edit`, a patch of set/remove/append/unset operations over the same field paths the
UI and `resolve` already use, gated by the same schema and content checks every run passes — and
makes a chat instruction one round trip: the bot applies it, settles any dispute it would otherwise
leave, and the entry is **confirmed as the chat actor's** without a visit to the UI (a filesystem
confirmation ledger the ui-backend honours beside its own). Separately, the decision-table row shape
that three contracts left undefined (the store schema, the unit schema, the card) becomes one
declared shape — flat rows keyed by the table's own columns — checked at the store gate.

Owner rulings this addendum records (2026-09-09): «when user say edit that data, do all thing and it
doesn't need to user go to ui and accept something»; the residue of the failed attempt is rolled
back; the owner runs the first real edit through the bot themself.

## 1. Invariants added

| ID | Invariant |
|---|---|
| **I7 — a chat instruction is one round trip.** | Whatever a chat instruction asks of an existing entry, the store ends in a state that needs no action in the UI: no open dispute the instruction created (a `set` on a disputed path settles it), and the entry confirmed as the chat actor's at the content the instruction produced. The only thing the bot asks the owner is a one-line «تأیید» for a destructive change (retire, merge, removing a member) or for prose the bot had to compose itself; an instruction that names the target and the exact value **is** INV-5's approval. |
| **I8 — one row shape for a decision table.** | `data.table.rows[]` of a `lang: table` rule is a list of flat objects keyed by the table's own `inputs[]`/`outputs[]` keys, and the store gate refuses any other shape. The design mock's nested `{when, then}` rows leave the vocabulary; the card reads the declared shape only. |

INV-4 stands: there is still no hard delete — `retire` remains the deletion, and the UI hides
retired entries. INV-5 stands as written; §5 says how an explicit instruction satisfies it.

## 2. `merge facts edit`

### 2.1 Command

```
merge facts edit --id F-… --patch <run_dir>/facts-patch.json --run <run_dir> [--preview]
```

A writing verb in the shape of `resolve`/`retire`/`promote` (`verbs.py` module docstring): load the
store, find the entry, mutate it, `derive_status`, stamp `updated_at`, `_snapshot` to
`{run_dir}/facts-before/`, `save_store`, append `{"verb": "edit", "args": {…}}` to
`{run_dir}/facts-delta.json`. One entry per call; one run directory per call (never `apply`'s).
Exit 2 with `precondition failed: …` on stderr and nothing written on any refusal (ARD §7).

### 2.2 The patch — `facts-patch.schema.json` (new, frozen like the others)

```json
{"schema_version": 1,
 "ops": [
   {"op": "set",    "path": "statement",                 "value": "برگهٔ روزانهٔ …"},
   {"op": "set",    "path": "data/outputs/vazn/value",   "value": 285},
   {"op": "set",    "path": "scope/departments",         "value": ["cooking", "warehouse"]},
   {"op": "remove", "path": "data/applies_to/pitza__s0__j__r6"},
   {"op": "unset",  "path": "data/pack"},
   {"op": "append", "path": "aliases",                   "value": "برگه روزانه"},
   {"op": "append", "path": "data/fields",               "value": {"key": "tozihat", "title": "توضیحات", "type": "string"}}
 ]}
```

- `path` is a QF-7 path: `/`-separated segments; a segment into a list names a member by its `key`,
  or, for `accounts[]`, by its `id` (the one keyed list whose members carry no `key`; `_step` learns
  the second name). `ops` is applied in order; a later op sees the earlier one's result.
- `set` writes `value` at `path`, creating a missing leaf on an existing parent, replacing a scalar,
  an object, a list, or a whole list member (a member replaced by `set` keeps its `key` — a `value`
  that changes it is refused).
- `remove` deletes a list member named by the path's last segment; `unset` deletes a dict key.
  Either on a path that does not exist is a refusal (nothing to remove is a wrong instruction, not
  a no-op).
- `append` adds `value` to the list at `path` (created when absent on an existing parent).
  Appending a keyed member whose key is already present is a refusal — that is a `set`.
- `value` is any JSON; the schema of the resulting entry is what constrains it.

### 2.3 Refusals

1. Unknown `--id`; a patch that fails `facts-patch.schema.json`; an op whose path cannot be walked
   (parent missing, list member not found); a `--run` directory with no `meta.json` in it (the
   chat citation of §2.4 points at that file, and the ledger reads the actor off it).
2. A path whose first segment is `id`, `kind`, `key`, `status` or `updated_at` — identity and
   derived fields. A kind change is `promote` (notes only, as today); a key is identity and is
   never renamed (item keys live in `refItems` cells across the store). `retired` is half-immutable:
   `set retired false` is allowed (§1's promise that a mistaken retire is undoable), anything else
   under `retired` is refused with «retire is the verb» — retiring dates the entry, names an heir
   and asks the owner first, which is `retire`'s job; `valid_to`, `supersedes` and `superseded_by`
   stay editable.
3. A `remove` of a `source[]` member (provenance is never edited out; `repair-source-refs` is the
   only writer of a citation's `ref`) — the other members of `source` are editable only through the
   verbs that already own them, so any op under `source` is refused.
4. The resulting entry fails the store gate — the same gate every run passes and nothing less:
   `facts.schema.json` for its kind's file (the `save_store` pass), and `content.check_document` on
   the kind's file with the store, the declared unit symbols and the estate conventions (the pass
   `validate facts` runs, and `simulate` runs on a delta): the style card lint on every prose leaf,
   every `{ref}` resolvable, every `refItems` cell an open item or a namespace code, unit symbols
   declared, keys minted, the constant shape, `field_status` paths, the decision-table row shape
   (§4). The refusal names the op index and the gate's own message.
5. An `applies_to`/`instances`/`imports` member added by `append` faces the gate of item 4 and
   nothing more: an `F-` ref inside it that names no entry is refused, and a `refItems` cell that
   is neither an open item nor a namespace code is refused. The binding's `record`/`field` pair
   itself is not verified — `apply` has no such precondition either, so there is nothing here to
   match (a ceiling, §9).

### 2.4 Effects on success

- The entry is written with the ops applied.
- **Disputes settle.** For every `set` whose path carries open `accounts[]`: the account whose
  `value` equals the new value (numbers as numbers, strings exactly) becomes `chosen`, every other
  open account on that path `rejected`; if none matches, a new account `{field, statement: <the
  value>, value, source: <the chat source>, status: chosen}` is appended and the rest `rejected`.
  A `remove`/`unset` of a disputed path rejects all its open accounts. `_clear_unit_ref` applies as
  in `resolve`. `field_status` entries whose path no longer exists are dropped.
- **Provenance.** One `source[]` member `{"type": "chat", "ref": "<run_dir>/meta.json", "run":
  "<run_dir>"}` is unioned in (the same dedup key `apply` uses) — the card's «گفتگو» row. The patch
  file stays in the run directory, verbatim, and the `facts-delta.json` list records
  `{"verb": "edit", "args": {"id", "patch": "<path>", "ops": <n>}}`.
- `status` re-derived, `updated_at` stamped; `location` recomputed when `instances` changed (the
  derived leaf, `apply._recompute_location`).
- The chat confirmation (§3) is written for the entry.
- **Revert.** `merge facts revert --run <run_dir>` restores the entry wholesale from
  `facts-before/` exactly as it does for `resolve`/`retire` (the verbs list's `args["id"]`); it
  also removes the chat confirmation row the run wrote.

### 2.5 `--preview`

Applies the patch to a deep copy, runs every refusal check, writes nothing, and prints to stdout one
block per op:

```
[1] set statement
    فعلی:    سیاههٔ روزانهٔ آشپزخانه که …
    پیشنهاد: برگهٔ روزانهٔ آشپزخانه که …
[2] remove data/applies_to/pitza__s0__j__r6
    فعلی:    {…the member, one line…}
```

then either `OK` (exit 0) or the refusal lines (exit 2). Values are rendered as the store holds
them (JSON for objects and lists, the bare string for a string, Latin digits for a number); the bot
relays them as they are — this is the owner's own data. A value longer than 400 characters is
elided in the middle with «…». The preview is also how the bot builds INV-5's field-by-field view
without reading the store file itself.

## 3. Chat confirmations — the ledger `facts/.confirmations.json`

### 3.1 Why a second channel

A confirmation is the ui-backend's: `(target, fingerprint, confirmed_by, confirmed_at)` in
`app.db`, matched against the entry's current `fact_fingerprint`. Any change moves the print and
un-confirms the entry, which is right for a pipeline run and wrong for the owner's own instruction —
the owner has just said what the entry should say. The engine cannot reach `app.db` (components
communicate through the filesystem only, ARD §1), so the chat actor's vouching is a file the engine
writes and the ui-backend reads.

### 3.2 The file — `facts-confirmations.schema.json` (new)

```json
{"schema_version": 1,
 "entries": {
   "F-00150": {"updated_at": "2026-09-09T09:12:31Z", "by": "owner",
               "run": "runs/facts/cooking/20260909-091210", "at": "2026-09-09T09:12:31Z"}}}
```

- `updated_at` is the entry's own `updated_at` **after** the write — the identity of the content
  vouched for. Every engine write path stamps `updated_at` on every entry it touches
  (`apply._stamp`, the verbs), so a later change by anything moves it and the row goes stale on its
  own, the way a fingerprint mismatch does. No fingerprint is shared between the two components.
- `by` is `meta.json`'s `actor`; `run` the run directory; `at` the write time.

### 3.3 Writers

- `merge facts edit` always writes the row for its entry (the verb exists for chat instructions).
- `apply`, `resolve`, `retire`, `promote` write the row for every entry they touch (created or
  updated) **when `{run_dir}/meta.json` exists and says `origin: "chat"`**; a pipeline or UI run
  writes nothing here. `revert` removes the rows a run wrote (matched by `run`).
- `save_store` prunes every row whose `updated_at` no longer equals its entry's, or whose entry is
  gone — the file never carries a stale vouch. It is written with the same atomic write as the five
  store files and rebuilt index, under `facts/` (merge-only for the agent, guard-unchanged: the guard
  already covers `facts/.+`).

### 3.4 Readers — ui-backend

`routers/facts.py`'s list and detail, and `routers/confirmations.py`'s `_row`/`list_confirmations`:

```
confirmed = (db mark == fact_fingerprint(entry)) or chat_confirmed(root, entry)
chat_confirmed = ledger[entry.id].updated_at == entry.updated_at
```

`confirmed_by` for a chat row is `chat:<by>`. The listing reads the ledger once per request (it is
one small file), the way it resolves the DB marks in one statement. A chat confirmation counts at
every department the entry names (QF-27) — the chat actor is the owner, admitted by
`ALLOWED_USER_IDS`, and an owner's instruction is not scoped by the department table.

**Revoke.** `DELETE /api/confirmations/{fid}` deletes the DB row as today **and** removes the
ledger row when one matches, writing the file with the ui-backend's own atomic write (the ledger is
a confirmation record, not store content; `facts/**`'s merge-only rule is the agent's, hook-enforced,
and the ui-backend already writes the data-repo). The audit event records `chat: true` when a ledger
row was removed. Re-confirming in the UI writes the DB as today; the two channels never disagree
because both are compared against the entry as it is.

**Fingerprint unchanged.** `FACT_EXCLUDED_TOP_LEVEL` stays `("updated_at",)`; the ledger is not
part of the entry and moves no print.

## 4. The decision-table row contract (I8)

- `facts.schema.json` and `facts-delta.schema.json`: `ruleData.table` becomes
  `{"type": "object", "additionalProperties": false, "required": ["inputs", "outputs", "rows"],
  "properties": {"inputs": string[], "outputs": string[], "rows": object[] (each
  `additionalProperties: {}` — any JSON leaf, keys unconstrained by the schema), "hit": enum
  first/unique/collect, "aggregate": enum sum/product/min/max, "default": object}}`.
- `content.py` gains `_check_table_shape` (a ninth check): for a rule with `lang: table` — `table`
  present; `table.inputs` ⊆ `inputs[].key` and `table.outputs` ⊆ `outputs[].key`; every row's keys
  ⊆ `table.inputs ∪ table.outputs`, and every row names at least one output; `default`'s keys ⊆
  `table.outputs`; a row carrying `when` or `then` is named as the old shape («row 3 carries when/
  then — a row is flat, keyed by the table's columns»). `expr` on a `lang: table` rule must be
  `null` or absent. A `table` on a rule whose `lang` is not `table` is refused.
- The unit gate needs nothing of its own: I1 materialises every entry through this same
  `check_document` (v3.4), so a unit's flat rows are judged by §4 before the store ever is.
- The card (`facts_plan/build.py` `KIND_NOTE["rule"]`) gains the fourth shape in words — «جدول
  تصمیم — `lang: table`، `expr` خالی، `table` با `inputs`/`outputs` (کلیدهای همان ورودی و خروجی‌ها)
  و `rows[]` که هر سطر یک شیء تخت است با همان کلیدها» — and `EXAMPLES` gains a fourth example, a
  two-row table, validated against the delta schema like the other three.
- The UI (`RuleCard.tsx`) reads the declared shape only: `cellOf`'s nested branch and its type
  comment go; the test fixture's rows become flat.
- The two cooking entries already in the store (F-00193, F-00194) pass §4 unchanged.

## 5. The `edit-fact` playbook, v2 (`data-repo/.claude/skills/edit-fact/SKILL.md`)

Steps 1 (resolve the entry) and 2 (run directory and `meta.json`, `origin: chat`, the instruction
verbatim) stay as they are, with one addition to Step 1: an instruction naming **several** entries
(«در شرح ۱۰ ثبت …», «همهٔ قاعده‌های آشپزخانه که …») resolves to a list, and everything below runs once
per entry, each in its own run directory, in order; an entry that fails does not stop the others,
and the report names each.

**Step 3 — classify, then write the change.** Three cases, decided from the instruction and the
loaded entry:

| the instruction … | vehicle | who writes it |
|---|---|---|
| adds: a new entry from scratch, a dated successor (QF-35), a fill of a `null`/absent leaf, a new source/account/alias | `facts-delta.json` → `apply` (as today) | the `quantify` agent, targeted mode |
| changes or removes what an existing entry says, and **names the value** (a word, a sentence, a number, a member to drop, a department to add) | `facts-patch.json` → `edit` | the playbook itself — the value is the owner's, there is nothing to compose |
| changes what an existing entry says and the bot must **compose** the text (a statement to reword, a title to invent) | `facts-patch.json` → `edit` | the `quantify` agent, targeted mode, patch form |
| retires, merges | `retire [--heir]` (as today) | — |

A mechanical change is written by the playbook without a dispatch: the owner's exact value goes into
a `set`, a removal into `remove`, «هم‌چنین …» into `append`. The style-card lint at the verb's gate
is what keeps a badly formed sentence out, whoever wrote it.

**Step 4 — preview and gate.** Run `merge facts edit … --preview` and keep its output. Then:

- **No question** for a mechanical change (case 2) or an addition (case 1): the instruction named
  the target and the value, which is INV-5's approval (owner ruling 2026-09-09). Proceed.
- **One question**, the preview shown in full, for composed prose (case 3), for a `remove`, and for
  a retire/merge (the existing one-line «… بازنشسته می‌شود. تأیید می‌کنید؟»). One message for the
  whole instruction, however many entries; wait for «تأیید»; if declined, write nothing.
- A preview that exits 2 is a wrong instruction or a bad composition: for case 3 re-dispatch once
  with the refusal appended; for case 2 tell the owner what the gate refused, in Persian, and stop.

**Step 5 — write.** `merge facts edit` (without `--preview`), or `apply`, or `retire`, exactly as
§2 of this file and the existing playbook say — one verb per run directory. No `resolve` follows an
`edit`: the verb settled the dispute itself.

**Step 6 — commit and report.** As today (allowlisted `git add`; `edit-fact(F-…)` message). The
report is the preview's own «فعلی/پیشنهاد» lines per entry, the ids touched, and — new — the
sentence «در پنل تأییدشده است» when the ledger row was written, so the owner knows there is nothing
left to accept.

**Deletions.** The old Step 4.B (apply → dispute → `resolve`) and Step 5's account-by-value hunt
go: a change to a filled field is an `edit`, never an `apply` that disputes.

## 6. The `quantify` agent, `targeted` mode

`entry` + `instruction` in, and now one of two files out: `{run_dir}/facts-delta.json` (an addition,
as today) or `{run_dir}/facts-patch.json` (a change to the loaded entry). The prompt's targeted
section says which is which in the table of §5, gives the path grammar (`/`-separated, a list member
by its `key`), and keeps the sentence «Touch no entry the instruction did not name»; a patch touches
no path the instruction did not ask about. The style card applies to every string a `set` writes.

## 7. Engine changes, by module

| module | change |
|---|---|
| `merge_facts/verbs.py` | `edit(root, fact_id, patch_path, run_dir, preview=False)`; `_apply_ops`; `_settle`; the chat-source union; ledger write |
| `merge_facts/__init__.py` | `_step` accepts `id` for `accounts[]` members; `remove_path`/`unset_path` beside `set_path`; `load_ledger`/`save_ledger`/`prune_ledger` (called by `save_store`) |
| `merge_facts/apply.py`, `verbs.py`, `revert.py` | chat-origin runs write/remove ledger rows (§3.3) |
| `merge_facts/content.py` | `_check_table_shape` (§4) |
| `merge/cli.py` | the `edit` sub-parser (`--id`, `--patch`, `--run`, `--preview`) |
| `facts_plan/build.py` | `KIND_NOTE["rule"]` fourth shape; fourth `EXAMPLES` member |
| `schemas/` | `facts-patch.schema.json`, `facts-confirmations.schema.json` (new); `table` in `facts.schema.json` and `facts-delta.schema.json`; `README.md` rows |
| `ui-backend` | `store/chat_confirmations.py` (read/remove the ledger); `routers/facts.py` list+detail; `routers/confirmations.py` `_row`, `list_confirmations`, `revoke_confirmation` |
| `ui/src/facts/cards/RuleCard.tsx`, `api/types.ts` | flat rows only |
| data-repo `.claude/skills/edit-fact/SKILL.md`, `.claude/agents/quantify.md`, `.claude/hooks/test_playbook_lint.py`, `.claude/hooks/test_guard.py`, `CLAUDE.md` | §5, §6, pins, the pointer table's `edit-fact` line |
| `docs/runbooks/07-facts.md` | new §13 «Editing through the bot»: the verb, the preview, the ledger, revert; §6 gains the ledger |
| `docs/decisions/0017-facts-pipeline-v3.md` | I7/I8 lines |

## 8. Testing

- `test_merge_facts_verbs.py`: every op on a seeded entry (set scalar/prose/object/list/member;
  remove member; unset; append member and scalar); order of ops; each refusal in §2.3 with nothing
  written (byte-identical five files + ledger); a `set` on a disputed path settles it three ways
  (matches an account; matches none; remove rejects all); the chat source unioned once across two
  edits; `--preview` writes nothing and prints current/proposed; `revert` of an edit run restores
  the entry and removes the ledger row; the ledger written by `edit` always and by
  `apply`/`retire` only under `origin: chat`; `save_store` prunes a stale row.
- `test_merge_facts_content.py` (or the existing content test file): the table shape — flat rows
  pass, `when/then` rows are named, a row key outside the columns, a missing output, `expr` on a
  table rule; the two real cooking entries (fixture copies) pass.
- `test_facts_plan_card.py`: the fourth example validates against the delta schema and appears on
  the card.
- ui-backend: list and detail report `confirmed: true` from a ledger row whose `updated_at` matches
  and `false` when it does not; a DB match still wins; revoke removes a ledger row and records it;
  the confirmations route's `_row` agrees with the facts routes.
- ui: `RuleCard.test.tsx` fixture flat; the nested-shape test goes.
- Hooks: `test_guard.py` pins that `merge facts edit --patch runs/facts/x/y/facts-patch.json` is
  allowed and a Bash write to `facts/.confirmations.json` is blocked; `test_playbook_lint.py` pins
  the targeted section's two output forms and the skill's three-case table.
- Schemas: `make test`'s frozen-contract check covers the two new files.

## 9. Deliberate ceilings

- No hard delete, no key rename, no kind change outside `promote` — each stated in the refusal.
- One entry per `edit` call; a many-entry instruction is many run directories (revertible each).
- The ledger is keyed by `updated_at` equality, not by content: an engine write that changes
  nothing but still stamps the entry un-confirms it. Every engine write path stamps only entries it
  changed (`apply._stamp` on `changed`, the verbs on their one entry), so this does not occur today;
  it is named here so a future path that stamps blindly is known to cost a confirmation.
- The chat actor is whoever `meta.json` names; the engine does not verify it. The bot's user
  allow-list is the only gate on who may instruct it.
- An appended binding's `record`/`field` pair is not verified (§2.3 item 5): the gate resolves the
  `F-` refs and `refItems` cells inside it and stops there, the same reach `apply` has.
- The preview renders values, not diffs: a long statement shows whole, twice.
- `field_status` is editable through `set field_status/<path>`; the content check keeps it honest.

## 10. Rollout

1. Engine + schemas + ui-backend + ui + docs on the code worktree; data-repo prompts on the data
   worktree; both merged into their mains when the final review is clean.
2. The control-bot image rebuilt (engine baked in) and the container recreated **while the bot is
   idle**; the ui-backend image rebuilt and recreated; both data-repo prompt commits are host-side
   git operations, so the control-bot is restarted after them.
3. The residue of the failed attempt (eight records with a chat source and a moved `updated_at`,
   ten run directories) was rolled back on 2026-09-09 before this work started, at the owner's
   «ok».
4. The owner runs the first real edit («سیاهه → برگه» in ten statements) through the bot.
