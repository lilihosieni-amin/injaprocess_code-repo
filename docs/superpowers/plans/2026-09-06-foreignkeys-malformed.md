# Malformed `foreignKeys[]` — crash, validation gap, bad data

> **DONE, 2026-09-06** — `5862498` (screen + content pass), `4a513f5` (the
> repair verb), data-repo `bc53b2d` (the 72 records and the playbook). Kept for
> the evidence and the route argument, not as work outstanding. Two things the
> plan got wrong, corrected in place below: the 84 malformed members sit on
> **72** records, not 84; and the playbook was transcribing a **spec** checklist
> that contradicted the spec's own §8, so the correction had to land there too.
>
> Written before a context compaction. The investigation was already done and
> its evidence is recorded below.

**Reported (owner, 2026-09-06):** opening some facts entries — named
`Table_Ingredients_SinglePizza`, the single-pizza-recipe mirror — shows
"Unexpected Application Error! Cannot read properties of undefined (reading
'join')".

**Owner instruction:** *"do all three fixes and the 84 records."*

---

## Where the work happens

| | |
|---|---|
| Worktree (all code-repo work) | `/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo/.claude/worktrees/facts` |
| Branch | `worktree-facts` (last commit `2799e5a`, already merged to main once) |
| data-repo (live, shared) | `…/process dev/data-repo` |
| Main checkout | `…/process dev/code-repo` — **this session cannot run git there** |

### Environment quirks that will otherwise waste time

- **Bash isolation:** one plain command per call. No `&&` chains, no `;` chains
  with `cd` — they are refused as "too complex". `cd` does **not** persist
  between calls; use absolute paths or `cd X` as the first statement of a single
  command.
- **No git against the main checkout.** `cd main && git …` and `git -C main …`
  are both refused. The owner runs merges in their own terminal.
- **pytest:** `.venv/bin/pytest -q -k <pattern>` from the worktree root. Never
  pass explicit test file paths — a rootdir quirk gives `ModuleNotFoundError:
  conftest`.
- **vitest / playwright:** `cd "<worktree>/ui"` as the first statement, then
  `npx vitest run <filter>` / `npx playwright test <spec>`.
- **data-repo is live and shared:** stage explicit paths, **never `git add -A`**;
  leave unrelated dirty state alone. `tmp/` is never committed.
- **Commit trailers** (both repos):
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WEi81KEmthAmcfSzpn88kx
  ```
- **Local stack:** compose runs from the **main** checkout's `deploy/`
  (`docker compose -f docker-compose.local.yml …`). `ui/dist` is bind-mounted, so
  a UI-only change needs `npm --prefix ui run build` + `restart ui-backend` and
  **no image rebuild**. `control-bot` is currently **stopped** at the owner's
  request.

---

## Root cause — established, with evidence

Three layers. The middle one is why the bad data reached a screen.

### 1. The data is wrong (the real fault)

Spec `docs/superpowers/specs/2026-08-29-quantitative-facts-design.md:903` defines
a foreign key as:

```
{fields: [...], reference: {ref}, reference_fields: [...], transform?: {ref}}
```

The store holds, on every one of them (example `F-00216`):

```json
{ "spreadsheetId": "1shX…", "sheet": "singlePizza",
  "range": "A:X", "target": { "ref": "F-00193" } }
```

A different object, not a missing optional.

- **84 malformed members across 72 records: 70 `role: mirror`, 14 `role: reference` (the 14 sit on just two id-registry tabs).**
- **Zero** members in the whole store carry the spec's shape.
- It is also redundant: `F-00216` already carries `mirror_of: {ref: F-00193}`
  **and** `import: {file_id_named_range, source_sheet, range}` correctly. The
  agent wrote the import descriptor a third time into the wrong collection.
- **A mirror can never have a valid one.** Spec `:908` — a mirror is
  *"a record with `role: mirror`, `mirror_of: {ref}` and no `fields[]`"*, and a
  foreign key declares a join **between fields**. There is nothing to describe.
- Spec `:1253` gives the §11 dedup key for `foreignKeys` as `(fields, reference)`
  — both absent, so every member dedups as identical. That collection's merge
  behaviour is broken too.

### 2. Nothing validated it

`engine/merge_facts/content.py:345`:

```python
for fk in data.get("foreignKeys") or []:
    if not isinstance(fk, dict):
        continue
    for m in fk.get("fields") or []:        # ← absent `fields` ⇒ empty ⇒ passes
```

It checks what is *inside* `fields`, never that `fields` **exists**.
`schemas/facts.schema.json` cannot help either: it types `data` as an open
object (`{"type": "object"}`), which is also why the delta validated.

### 3. The UI trusts it

`ui/src/facts/cards/RecordCard.tsx:662-680` — inside `.map` over `foreignKeys`:

```tsx
<div key={fk.fields.join('+')} …>
  <Mono …>{fk.fields.join(' + ')}</Mono>
```

`fk.fields` is `undefined` → the reported `TypeError`. Note `reference_fields`
one line below is already guarded with `?? []`; `fields` and `reference` are not.

---

## Task 1 — UI must not crash (code-repo, worktree)

**File:** `ui/src/facts/cards/RecordCard.tsx` (~662-680)
**Test:** `ui/src/facts/cards/RecordCard.test.tsx`

Every other read on this screen is never-raise (`facts_store`'s discipline,
`bundle.ts`'s narrowing); this is the one place that trusts. A malformed member
must be **skipped, not drawn** — a row with no fields and no reference describes
nothing, and half-drawing it would be worse than omitting it.

- [ ] **Step 1 — RED.** Add a test that a record whose `foreignKeys` holds
      `{spreadsheetId, sheet, range, target}` renders **without throwing** and
      draws **no** `foreignKeys` row. Use the real shape from `F-00216` above.
      Run `cd "<worktree>/ui"` then `npx vitest run src/facts/cards` — it must
      fail with the reported `TypeError`.
- [ ] **Step 2 — GREEN.** Filter the collection to members that are a dict with
      a non-empty `fields` array **and** a `reference.ref`, before the
      `.length > 0` gate and the `.map`. If none survive, the whole block is
      absent. Keep the `key` stable (`fields.join('+')` is fine once filtered).
- [ ] **Step 3 — mutation-check.** Remove the filter, confirm the new test
      fails, restore.
- [ ] **Step 4.** `npx vitest run src/facts` and `npx tsc -b --noEmit`.

## Task 2 — the content pass must refuse it (code-repo, worktree)

**File:** `engine/merge_facts/content.py` (~345)
**Test:** `engine/tests/test_validate_facts_content.py`

This is the root-cause fix: with it, no future run can put this in the store.

- [ ] **Step 1 — RED.** A test that a record whose `foreignKeys` member lacks
      `fields` (the `F-00216` shape) is **refused** by the content pass, with a
      message naming the entry and the collection. Run
      `.venv/bin/pytest -q -k validate_facts_content` — must fail (today it
      passes silently).
- [ ] **Step 2 — GREEN.** Require, per member: `fields` present, a list, non-empty,
      every member a string; and `reference` present with a `ref`. Match the
      surrounding message style (`f"{label}: foreignKeys …"`). Keep the existing
      declared-field check for the members of `fields`.
- [ ] **Step 3 — mutation-check** and re-run
      `.venv/bin/pytest -q -k "validate_facts or merge_facts"`.

**Watch for:** the 14 `role: reference` records DO have `fields[]`, so a correct
foreign key is expressible there; a mirror's is not, and Task 4 deletes rather
than repairs. Do not write a check that forces a mirror to grow a foreign key.

## Task 3 — the playbook must stop writing it (data-repo)

**Files:** `../data-repo/.claude/skills/quantify/SKILL.md`,
`../data-repo/.claude/agents/quantify.md` — grep both for `foreignKeys`.

- [ ] State the member shape verbatim from spec `:903`.
- [ ] State that a **mirror carries `mirror_of` + `import` and no `foreignKeys`**
      — the import descriptor is not a foreign key, and a mirror has no `fields[]`
      to join on.
- [ ] Commit to data-repo with explicit paths (see trailers above).

**Also applies:** the messaging rules committed on 2026-09-02 (`7b8cf15`) — no
commands, paths, ids or English department codes in user-facing text; keep
**csv**, **Excel**, **sheet** untranslated.

## Task 4 — repair the 84 members (data-repo)

`facts/**` is written **only** by `merge facts` (QF-2) — no hand-editing, no
script writing those five files directly.

- [ ] **Step 1 — establish the route.** The write ladder never overwrites or
      deletes, and no existing verb removes a payload key. Check
      `engine/merge_facts/verbs.py` for what `resolve/retire/promote/export/revert`
      can actually do. Expect the honest answer to be **none of them**, in which
      case the options are:
      1. a small, tested engine verb/flag whose only job is dropping a named
         malformed collection (goes through the sanctioned writer, keeps QF-2);
      2. `merge facts revert` on the quantify run that wrote them, then re-run
         `quantify` with the corrected playbook — clean, but re-does a lot of work
         and only if a single run owns all 84;
      3. ask the owner.
      **Decide with evidence, record the ruling, and tell the owner which route
      and why before running it.**
- [ ] **Step 2.** Whatever the route, take the run-directory discipline: a fresh
      `runs/facts/{dept}/{stamp}/`, `meta.json` with `origin: "ui"`-equivalent
      honesty about who ran it, and `facts-before/` so it is revertible.
- [ ] **Step 3 — verify.** Re-run the scoping script that produced the numbers
      above: expect `malformed: 0`. Then confirm the previously-crashing entry
      renders.
- [ ] **Step 4.** Commit data-repo: explicit paths, `facts` and `runs` only.

---

## Finish

- [ ] Engine: `.venv/bin/pytest -q -k "facts or merge_facts or validate"`.
- [ ] UI: `cd "<worktree>/ui"`, `npx vitest run`, `npx playwright test`
      (all three width projects), `npx tsc -b --noEmit`, `npx eslint src`.
- [ ] Commit code-repo on `worktree-facts`.
- [ ] **Ask the owner to merge** — they run, in their own terminal:
      ```
      cd "…/process dev/code-repo"
      git status --short
      git merge worktree-facts
      ```
- [ ] Then rebuild for them: `npm --prefix ui run build` in the main checkout,
      and `docker compose -f docker-compose.local.yml restart ui-backend` from
      main's `deploy/`. Engine changes do **not** reach the running containers
      without an image rebuild — if Task 2 or 4 must run inside `control-bot`,
      rebuild `control-bot` too (it bakes `engine/` at `/opt/engine`), and note
      it is currently stopped.

## Still open from earlier (do not lose)

- **`F-00001` (units) is red and unconfirmable**: `carton`/`pack` carry
  `factor_to_base: null` by spec design, while QF-6 reads an explicit null as
  «بی‌پاسخ». Contradicts runbook 07 §4, which says to confirm it. Spec §14 note 3
  ("omitted = not applicable, null = unanswered") suggests those two rows should
  **omit** the field. Owner's decision, still pending.
- **`scroll.ts` has no unit tests** — the 2026-09-06 e2e is the only thing
  exercising it.
- **Proposed eleventh conformance note** (`hasGrid`) awaits the owner, recorded
  in `docs/superpowers/plans/facts-design-audit.md` §9.2.
- **«منبع تغییرکرده»** is undrawable until the backend serves a moved-source
  flag (audit §9.1).
