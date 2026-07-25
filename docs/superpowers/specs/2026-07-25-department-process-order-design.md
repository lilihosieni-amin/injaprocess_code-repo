# Department process order is a per-department `order.json`, written only by a new `order` CLI

**Date:** 2026-07-25
**Scope:** `code-repo` — new `schemas/order.schema.json`, new `engine/order/` CLI, a reconcile hook
in `engine/merge/cli.py`, one new `ui-backend` endpoint plus three handlers made order-aware, one
new UI modal; **and** `data-repo` — `guard.py`, `CLAUDE.md`, two skills (separate repo, separate
commit).
**Why:** a department's processes currently have no meaningful sequence — the UI list renders them
in filename order. The order matters for reading the list, and it is a hard prerequisite for the
planned **department process export**, which cannot guess placement.
**Relation to ADR 0009:** restructuring is a normal event in this system, so the design must
preserve a curated position across merge/split rather than sending heirs to the bottom of the list.
**Out of scope:** the export feature itself. This design only guarantees the export will have a
complete, trustworthy sequence to consume.

---

## 1. Decisions

Settled during design; each closes an ambiguity that would otherwise be resolved differently by
different parts of the system.

| # | Decision |
|---|---|
| D1 | The order is a **curated display order** — a human-chosen table of contents. It makes no claim that process A happens before process B in the real world. |
| D2 | **One flat list per department** covering root *and* sub-processes, each exactly once — matching what the list screen shows today. The export can still nest by reading each process's `parent`. |
| D3 | A newly created process is **auto-appended** to the end. There is no "unplaced" state anywhere in the system. |
| D4 | The AI runtime has **read-only awareness**: it may read `order.json` as context and is hook-blocked from writing it, exactly like `processes/*.json` (INV-1). |
| D5 | **Tombstoned processes are dropped** from `order.json`, so the file always equals the active set. The UI renders ordered actives first, then tombstones in id order. |
| D6 | The order file is **authoritative and kept exact by the CLI** — not a tolerant hint that each reader reconciles its own way. |
| D7 | A **restructure heir inherits the position** of the earliest process it supersedes, so curation survives merge/split. |
| D8 | A **new sub-process created by `merge update` is inserted directly after its parent**, not appended — same locality logic as D7. |
| D9 | Reordering happens in a **dedicated compact modal**, not inline on the process list. |

---

## 2. Data contract

One file per department, beside `overview.json`:

```jsonc
// data-repo/departments/dining/order.json
{
  "department": "dining",
  "order": ["dining-007", "dining-006", "dining-008", "dining-009"],
  "updated_at": "2026-07-25T12:00:00Z"
}
```

Position **is** the array index — there are no explicit rank numbers that could drift out of
agreement with the array. Entries are plain id strings; everything else about a process already
lives in its own file.

`schemas/order.schema.json`, draft 2020-12, `additionalProperties: false`, matching the house
style of the existing schemas:

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "order.schema.json",
  "title": "Department process display order (ARD §4.6)",
  "type": "object",
  "additionalProperties": false,
  "required": ["department", "order", "updated_at"],
  "properties": {
    "department": { "type": "string", "pattern": "^[a-z]+$" },
    "order": {
      "type": "array",
      "uniqueItems": true,
      "items": { "type": "string", "pattern": "^[a-z]+-[0-9]{3}$" }
    },
    "updated_at": {
      "type": "string", "format": "date-time",
      "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]+)?Z$"
    }
  }
}
```

**What the schema deliberately does not express**, because JSON Schema cannot see the filesystem:
that every id belongs to *this* department, exists on disk, and is not tombstoned, and that the set
is complete. Those are CLI preconditions plus the `order check` verb (§3). This is the same split
already used by `process.schema.json`.

**A missing `order.json` means "no curated order yet"** and every reader falls back to id order.
Seven of the nine departments have no processes at all, so the file is created lazily on first
append rather than committing nine near-empty files.

### 2.1 The one ordering rule

Implemented in exactly one place — `ui-backend`'s `list_processes` (§5). The engine keeps the file
*exact*, so `reconcile` never needs this fallback, and the export will read an already-exact file.
Putting it in the engine as a shared helper would mean the backend either imports engine modules
(which it deliberately never does — it only shells out to the CLIs) or carries a second copy:

```
ordered(actives, order) = [id for id in order if id in actives]
                        + [id for id in sorted(actives) if id not in order]
```

Stale ids in `order` are skipped; actives missing from `order` land at the end in id order. In a
consistent repo the second list is always empty — it exists so that a hand-edited or
mid-migration `data-repo` degrades gracefully instead of hiding processes.

For UI display, tombstones sorted by id are appended after that result.

**Active set** means every `departments/<dept>/processes/*.json` whose `tombstoned` is not `true`.

---

## 3. The `order` CLI

New `engine/order/` package with `cli.py`, registered in `engine/pyproject.toml` under
`[project.scripts]` and `[tool.setuptools.packages.find]`. Follows the house conventions of
`allocate-id`/`merge`: reads `DATA_ROOT` from the environment, deterministic and LLM-free, exit
`2` on a failed precondition with the reason on stderr, and a `--now` flag so tests can pin
timestamps.

| Verb | Job | Output / exit |
|---|---|---|
| `order show <dept>` | print the current sequence (ops/debug; the UI does not use it — see §5) | one id per line; missing file prints nothing, exit 0 |
| `order sync <dept>` \| `--all` | reconcile against disk: append actives missing from the file, drop ids that are tombstoned or gone. Idempotent — the workhorse every write path calls | `+<id>` / `-<id>` lines for what changed, exit 0 |
| `order set <dept> --sequence a,b,c` | replace the whole sequence | exit 2 with `set mismatch: missing=… stale=…` unless the given set is exactly the active set |
| `order move <dept> --process <id> --to <n>` | move one id to 1-based position `n`, shifting the rest | exit 2 if the id is absent or `n` is out of range |
| `order check <dept>` \| `--all` | read-only: does the file equal the active set? | exit 0, or exit 2 with a `missing:` / `stale:` report; with `--all`, exit 2 if **any** department drifts |

`--now` is accepted by every mutating verb (`sync`, `set`, `move`), matching `merge`'s convention.

`--sequence` is comma-separated. A department would need thousands of processes before argv length
became a concern, so no file-based variant is provided.

Every mutating verb validates the resulting document against `order.schema.json` *before* the
atomic write, so a malformed file can never land.

`order set` refusing a mismatched set is what makes the file trustworthy: it means no UI save can
silently add or drop a process (see the 409 path in §5).

### 3.1 Python API consumed by `merge`

`merge` imports these directly — in-process, no subprocess spawn:

```python
read_order(dept, root=None) -> list[str]
reconcile(dept, now, root=None, heir_hints=None, child_hints=None) -> tuple[list, list]
```

`reconcile` is the single entry point. With no hints it is a plain disk diff. The hints carry the
placement knowledge only `merge` has:

- `heir_hints: {heir_id: [superseded_id, …]}` — insert the heir at the **lowest current index** held
  by any id it supersedes (lowest position in the existing order, not lowest id), before those ids
  are dropped (D7). When several heirs claim the same index, they are processed in id order and
  inserted consecutively there, so the result is deterministic.
- `child_hints: {parent_id: [child_id, …]}` — insert new children directly after their parent, in id
  order (D8).

Hints are advisory: an id already present keeps its position, and a hint referencing something
absent falls through to the append rule. So a hint can never corrupt the file, only improve
placement.

---

## 4. Engine integration — one hook in `merge`

`engine/merge/cli.py` calls `order.reconcile` once, after the verb has written its process files,
for each affected department (derived from the ids written — a restructure plan can in principle
span departments).

| Verb | Effect on the order |
|---|---|
| `new` | appends the parent, then its auto-created sub-process children (ids are minted monotonically, so id order *is* parent-then-children) |
| `update` | inserts new sub-process children after their parent via `child_hints` |
| `restructure` | inserts heirs at their predecessors' positions via `heir_hints`, then drops the tombstoned ids |
| `remove` | drops the tombstoned id |
| `attach-subprocess` | no set change — the child already exists and keeps its position |
| `accept`, `reject` | no set change — reconcile is a no-op |

One idempotent hook rather than six bespoke ones is why the last three cost nothing: reconcile is
always safe to call, so there is no per-verb branch to forget when a verb is added later.

### 4.1 What this means for `process-voice`

Nothing. There is **no new pipeline stage and no new agent instruction**:

- The file is created and maintained by `merge` during the existing **Stage 6**.
- The existing **Stage 8** commit is `git add departments runs` — the whole tree — so `order.json`
  is committed with no change to the playbook's commit command.
- The resulting default order is the **meeting's narrative order**: Stage 6 runs one `merge` call
  per candidate in segment order and ids are minted sequentially in that same order, so "append in
  id order" and "append in pipeline-creation order" coincide. The user starts from a sensible
  sequence and drags to refine it.

---

## 5. `ui-backend`

- `storage.py` — add `order_path(root, code)`.
- `engine.py` — add `order_set(cfg, code, sequence)` and `order_sync(cfg, code)`, using the existing
  `_run` subprocess wrapper.
- `routers/departments.py`
  - `PUT /{code}/order`, body `{"order": [...]}` → `order set` under `storage.file_lock`, then
    `gitcommit.commit` with action `update process order`; returns `{"order": [...]}` as saved.
  - **`GET /{code}/processes` becomes order-aware** — §2.1 applied, tombstones appended by id. One
    place decides ordering, so the UI never sorts and the export will get the same sequence from
    the same rule.

**There is deliberately no `GET /{code}/order`.** The reorder modal needs *processes in current
order*, which `GET /{code}/processes` already returns; a bare id list would force the UI to join it
against the process list itself and would need its own missing-file fallback, duplicating §2.1 in a
second place. The read side stays single.
- `routers/processes.py` — `create_process` and `delete_process` call `order_sync` and add
  `order.json` to the **same** commit, keeping one commit per user action (ARD §15).

**Error mapping.** `order set` exits 2 both for a mismatched set and for a schema failure. The CLI
prefixes the former with `set mismatch:`, and the backend maps an `EngineError` whose message
starts with that prefix to **409**, anything else to **422**. This is consistent with how the
codebase already maps `EngineError` to HTTP codes.

**The 409 is a real case, not defensive padding:** a pipeline run or a second tab can create a
process while the reorder modal is open. Then the saved sequence no longer matches the active set,
`order set` refuses, and the user is told. The alternative — accepting the stale sequence — would
silently drop the new process out of the order.

---

## 6. UI

- `api/types.ts` — `DepartmentOrder = { order: string[] }` (the `PUT` body and response).
- `api/hooks.ts` — `useSaveOrder(code)`, invalidating `['processes', code]`. No read hook is needed:
  the modal takes its list from the existing `useProcesses(code)`, filtered to non-tombstoned.
- **`ui/src/write/ReorderModal.tsx`** (new) — the compact panel: one ~34px row per active process
  showing grip, position number, id badge, name, and the «زیرفرآیند» tag; about eight visible at
  once. Local state; explicit «ذخیرهٔ ترتیب» / «انصراف», per the manual-save rule (FR-I3, ARD
  §13.2). Native HTML5 drag events **plus ↑/↓ buttons** — no new dependency (the UI has six
  runtime deps and none does drag-and-drop; these rows are far simpler than what `@dnd-kit`
  addresses), and the arrows cover keyboard and touch, which raw HTML5 DnD does not.
  On a 409 it shows a Persian «ترتیب تغییر کرده» notice and refetches.
- **`ui/src/screens/ProcessList.tsx`** — a «ترتیب فرآیندها» ghost button beside «فرآیند جدید»; a
  position number (via the existing `toFa` helper) on each active card; no client-side sort, since
  the endpoint is already ordered. Tombstones show no number.

The modal always shows the full department list, unaffected by the list screen's search box —
reordering a filtered subset has no coherent meaning.

**Chosen over inline drag-and-drop on the list** because dining has 31 processes: with ~90px cards
only about three are visible at once, so moving item 28 above item 3 means dragging through a long
scroll, and drag mode would collide with the search, delete and navigation controls the list
already carries.

---

## 7. Agent awareness (`data-repo`)

The agent's relationship to this file is *read, never write*, so awareness is three edits:

1. **`.claude/hooks/guard.py`** — add `departments/*/order.json` to the protected set alongside the
   existing `processes/*.json` rule: block `Write`/`Edit` and mutating `Bash` that references it,
   with the reason that only the `order` CLI writes it (INV-1). Add the matching cases to the
   existing `.claude/hooks/test_guard.py`.
2. **`CLAUDE.md`** — one row in the "Hard rules (also hook-enforced)" table, plus a short note that
   `order.json` is the human-curated display order: read it for context, never write it, and
   `merge` keeps it in sync automatically.
3. **`.claude/skills/process-voice/SKILL.md`** and **`.claude/skills/edit-process/SKILL.md`** — one
   line each stating the file updates itself via `merge`, so there is no stage and no action for the
   agent.

Deliberately minimal. The hook is what actually prevents an agent from "helpfully" curating the
order; the docs only prevent wasted attempts.

---

## 8. Document updates (done first, before any code)

**`PRD.md`**
- **FR-D12 (process order):** each department has an explicit, human-curated display order over its
  processes, used by the UI list and by the department export. It is generated and maintained by
  the system, never by the language model; a newly created process is appended to the end and a
  retired one leaves the order.
- **FR-I7 (reorder):** the user can reorder a department's processes in the UI through a dedicated
  reorder view, saved explicitly like every other edit.
- **INV-1** — state explicitly that the ordering, like identifiers, is written only by the system's
  CLIs and never by the language model.
- **AC-11:** after a department's processes are reordered in the UI, the new order is what the list
  shows on reopening, survives a later pipeline run, and new processes appear at the end.
- **§12 Open Items & Future** — one line: the department export consumes this order.

**`ARD.md`**
- **New §4.6 `order.json`** — shape, the §2.1 ordering rule, append/tombstone semantics,
  restructure position inheritance, missing-file fallback.
- **§8** — the `order` row in the CLI table, and `order.schema.json` in that section's schema
  paragraph.
- **§13.2** — the ordered list, the reorder panel, and the 409 path.
- **§14** — the guard extension covering `order.json`.
- **§15** — `order.json` rides in the same commit as the action that changed it.
- **§17** — a traceability row for FR-D12.

**`code-repo/CLAUDE.md`** — the `engine/` row gains `order`; the `schemas/` row is unchanged in
wording but the new schema is covered by `make test`.

**`docs/decisions/0016-department-process-order.md`** — an ADR recording why a separate CLI-written
file rather than a field in `overview.json`, following the existing 0001–0015 convention.

---

## 9. Testing

TDD, in the directories tests already live in:

| File | Covers |
|---|---|
| `engine/tests/test_order.py` | schema validity; `sync` appends/drops/is idempotent; lazy file creation; foreign-department id rejected; tombstoned dropped; `set` refuses a mismatched set; `move` bounds; `check` exit codes; `show` on a missing file |
| `engine/tests/test_order_hints.py` | `reconcile` with `heir_hints` places an heir at its predecessor's index; with `child_hints` places a child after its parent; a hint naming an absent id falls back to append; an already-present id keeps its position |
| `engine/tests/test_merge_order.py` | the order stays consistent after `new`, `update` with children, `restructure`, `remove`, `attach-subprocess`, `accept` |
| `ui-backend/tests/test_order.py` | `PUT` saves and returns the sequence; 409 on set drift vs 422 on schema failure; `order.json` present in the commit; `GET /processes` ordering with the tombstone tail; missing-file fallback; `create`/`delete` keep the order in sync within one commit |
| `ui/src/write/ReorderModal.test.tsx` | renders in the order the processes endpoint returned; ↑/↓ move a row; save calls the mutation with the full sequence; cancel discards; 409 shows the notice; tombstones are excluded |
| `ui/src/screens/ProcessList.test.tsx` | position numbers render in Persian digits; the button opens the modal; tombstones carry no number |

---

## 10. Migration

Dining has 31 processes and cashier has several, so the feature needs a one-time backfill:

```
DATA_ROOT=<data-repo> order sync --all
```

This creates `order.json` for every department that has processes, seeded in id order, and is a
no-op for the empty ones. Committed to `data-repo` as the migration step. `order check --all`
verifies the result.

---

## 11. Rejected alternatives

**A `process_order` field in `overview.json`.** No new file or schema, and `overview.json` already
has a `PUT` endpoint and a UI edit screen. Rejected because `overview.json` is rewritten by the
`summarize` AI subagent on every pipeline run, so the AI would clobber the human-curated order on
its next pass — directly contradicting D4. It would also mix human curation with AI-generated
narrative in one file.

**A tolerant hint file with no sync.** Almost no wiring: readers apply whatever order they
recognise and append the rest. Rejected because the append rule would live in each reader rather
than in the data, so the UI and the export could silently disagree about where a new process sits,
and the file would quietly rot. The export needs a sequence it can trust without second-guessing.

**An explicit `rank` integer per process, stored in `process.json`.** Rejected because ranks drift:
every insertion either renumbers many files (many git diffs, many commits) or leaves gaps that
accumulate, and `process.json` is written by `merge` per-process, so no single writer sees the whole
sequence at once.
