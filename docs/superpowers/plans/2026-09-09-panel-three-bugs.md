# Panel three bugs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three owner rulings of 2026-09-09: the panel's confirm tick is never set automatically (the v3.7 chat-confirmation channel is withdrawn); the quantitative-data list shows the newest-created entry first; the six fact switches on the content-display policy screen carry Persian names.

**Architecture:** B1 deletes one engine module and its five call sites, one ui-backend store module and its readers, one schema, and the docs that describe them — the panel's existing fingerprint comparison then revokes a confirmation by itself when the bot edits an entry, exactly as for a process. B2 is one `sorted` in the list route. B3 is six rows in a label table plus the type union.

**Tech Stack:** Python engine + FastAPI backend (pytest under `.venv`), React/TypeScript UI (vitest, tsc), JSON Schema.

**Spec:** the owner's words in chat, 2026-09-09: *"I only mean that confirm button that's in the UI and gets saved in the database — I don't want it to get checked automatically"*; *"newest created"*; *"this dropdown [نوع: آیتم، جدول، اندازه‌گیری، قاعده، یادداشت]. it should show this names."* Recorded as a ruling in `docs/decisions/0017-facts-pipeline-v3.md` by Task B1.

## Global Constraints

- Owner-facing text stays Persian; no internals in it.
- The engine stays deterministic. `merge facts` verbs keep stamping `updated_at` on every entry they touch (that is what makes the panel's mark go stale).
- Tests run scoped while iterating; each task runs the suite of the package it touched once before committing (`.venv/bin/pytest -q engine/tests`, `.venv/bin/pytest -q ui-backend/tests`, `cd ui && ./node_modules/.bin/vitest run <file>` + `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`).
- Commit on branch `facts-v3-gate` of each repo, never push, never touch `main`. Commit by path (`git commit -- <files>`), never `git add -A`.
- Code worktree: `code-repo/.claude/worktrees/facts-v3-gate`; data worktree: `process dev/data-repo.facts-v3-gate`.

---

### Task B1: The confirm tick is only ever set in the panel — the chat-confirmation channel is withdrawn

**Files (code-repo):**
- Delete: `engine/merge_facts/ledger.py`, `engine/tests/test_merge_facts_ledger.py`, `schemas/facts-confirmations.schema.json`, `ui-backend/inja_ui_backend/store/chat_confirmations.py`
- Modify: `engine/merge_facts/apply.py` (the `ledger.record` call ~line 707 and its import), `engine/merge_facts/verbs.py` (`ledger.record` at ~151 and ~527, `chat_origin` uses, the docstring lines that say the edit "calls `ledger.record` itself"), `engine/merge_facts/revert.py` (`ledger.forget_run` ~167), `engine/merge_facts/__init__.py` (`ledger.prune` in `save_store` ~327), `schemas/README.md` (the `facts-confirmations` row), `.gitignore` (the `facts/.confirmations.lock` line if present)
- Modify: `ui-backend/inja_ui_backend/routers/facts.py` (three sites: the listing's `chat = chat_confirmations.load(root)` + `or chat_confirmations.confirmed(chat, entry)`, the detail route's pair ~672/681, the ~882 read), `ui-backend/inja_ui_backend/routers/confirmations.py` (~147 `vouched`, ~207, ~307, ~332 `forget`, ~338), `ui-backend/inja_ui_backend/disclosure.py` (~211 `may_serve_fact`'s chat branch and its `chat` parameter — every caller passes one; drop the parameter everywhere)
- Modify tests: `ui-backend/tests/test_facts_confirmations.py` (every `chat` case: a chat-edited entry is **not** confirmed; delete `test_the_listing_reads_the_ledger_once_per_request`), `engine/tests/facts_helpers.py` only if something there exists solely for the ledger
- Docs: `docs/runbooks/07-facts.md` §13 (the "**The confirmation.**" bullet → the edit re-stamps the entry and the panel's tick goes stale by itself; a person re-confirms in the panel), `docs/guides/quantitative-facts-walkthrough.md` (Journey 2's ledger passage and the store-files table row for `.confirmations.json`), `docs/decisions/0017-facts-pipeline-v3.md` (I7's sentence about the ledger + a new ruling paragraph), `docs/superpowers/specs/2026-09-09-quantitative-facts-v3-chat-edit-design.md` (§3 marked withdrawn, one line)

**Files (data-repo):**
- `.gitignore` (drop `facts/.confirmations.lock`), `.claude/hooks/test_guard.py` (~314: the guard case that writes `facts/.confirmations…` — keep the guard's behaviour, only rename the probe file if it named the ledger as a legitimate write), `.claude/skills/edit-fact/SKILL.md` and `CLAUDE.md` (grep `confirm` — any sentence saying the edit counts as the owner's confirmation goes; the edit-fact report to the owner may say the change is recorded and the panel shows it as «تأییدنشده» until someone confirms it there)

**Interfaces:**
- Produces: `Disclosure.may_serve_fact(entry, targets, mark)` (no `chat`); the list/detail rows' `confirmed` is `mark is not None and mark == fact_fingerprint(entry)` and nothing else.

- [ ] **Step 1: Failing tests**

`ui-backend/tests/test_facts_confirmations.py` — rewrite every chat-channel test to its negation; the one that matters:

```python
def test_a_chat_edit_never_confirms_and_revokes_a_stale_panel_mark(data_root, tmp_path):
    """Owner ruling 2026-09-09: only a person in the panel sets the tick. A
    `merge facts edit` re-stamps the entry, so a mark stored for the earlier
    print no longer matches — the row reads unconfirmed until re-confirmed."""
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "*")
    before = client.get(f"/api/facts/{RULE}").json()
    client.post(f"/api/confirmations/{RULE}", json={"fingerprint": before["fingerprint"]})
    assert client.get("/api/facts").json()["entries"][0]["confirmed"] is True  # adapt: find RULE's row
    _edit_via_engine(data_root, RULE)            # write facts-patch.json + meta.json(origin chat), run `merge facts edit`
    row = next(r for r in client.get("/api/facts").json()["entries"] if r["id"] == RULE)
    assert row["confirmed"] is False
```
(`_edit_via_engine` is whatever this test file already uses to drive the engine's edit verb in the existing chat tests — reuse it; if it only faked the ledger file, drive the real verb through `subprocess` the way `test_facts_write_and_download.py` drives `merge`.)

Engine: no new test; the deleted ledger test is the change. Grep `engine/tests` for `confirmations` — must come back empty after the task.

- [ ] **Step 2: Run, expect failures** — `.venv/bin/pytest -q -k "chat or confirm" ui-backend/tests`

- [ ] **Step 3: Implement** — delete the four files; remove the five engine call sites and the import; drop the `chat` parameter from `may_serve_fact` and every caller; `confirmed` in list and detail rows is the fingerprint comparison alone; `routers/confirmations.py` no longer reads or forgets a ledger. `grep -rn "chat_confirmations\|ledger\.\|\.confirmations\.json\|confirmations\.lock" engine ui-backend schemas .gitignore` must be empty. Docs and data-repo edits as listed. Record the ruling in the ADR:

```
**Owner ruling, 2026-09-09 — the confirm tick is only ever set in the panel.** The v3.7 chat
channel (`facts/.confirmations.json`, a run of `origin: chat` vouching for what it wrote) is
withdrawn: *"I don't want it to get checked automatically."* A bot edit re-stamps the entry, the
stored mark no longer matches its print, and the panel shows «تأییدنشده» until a person confirms
it there — the same rule a process has always had. Automatic revocation stays; automatic
confirmation is gone.
```

- [ ] **Step 4: Suites** — `.venv/bin/pytest -q engine/tests`, `.venv/bin/pytest -q ui-backend/tests`, `make test`; hooks: `.venv/bin/pytest -q "<data worktree>/.claude/hooks"`.

- [ ] **Step 5: Commit** (both repos, by path) — `fix(facts): the confirm tick is only ever set in the panel — the chat-confirmation channel is withdrawn`

---

### Task B2: The quantitative-data list shows the newest-created entry first

**Files:**
- Modify: `ui-backend/inja_ui_backend/routers/facts.py` (`list_facts`, the `out` list)
- Test: `ui-backend/tests/test_facts_api.py`

- [ ] **Step 1: Failing test**

```python
def test_the_list_is_newest_created_first(data_root, tmp_path):
    """Owner ruling 2026-09-09: newest created on top. Ids are minted in
    creation order (`allocate-id`), so the order is id descending — not
    `updated_at`, which a run stamps on many entries at once."""
    _plant(data_root)
    client = _client_as(data_root, tmp_path, "editor", "*")
    ids = [r["id"] for r in client.get("/api/facts").json()["entries"]]
    assert ids == sorted(ids, reverse=True) and len(ids) >= 2
```
(Check `_plant`'s `ENTRIES` has at least two visible ids; if all rows share one prefix and the id strings sort lexically the same as numerically — `F-00002` < `F-00010` — plain string reverse-sort is the right order. Assert on that.)

- [ ] **Step 2: Run, expect failure**

- [ ] **Step 3: Implement** — before `return`, `out.sort(key=lambda r: r["id"], reverse=True)`; one sentence in the docstring: the owner wants the newest-created entry on top, ids are creation order, so id descending.

- [ ] **Step 4: `.venv/bin/pytest -q ui-backend/tests`**

- [ ] **Step 5: Commit** — `fix(facts): the panel lists the newest-created entry first`

---

### Task B3: The six fact switches on the content-display policy screen carry Persian names

**Files:**
- Modify: `ui/src/screens/Visibility.tsx` (`ROWS`), `ui/src/api/types.ts` (`PolicyField` union)
- Test: `ui/src/screens/Visibility.test.tsx`

- [ ] **Step 1: Failing test** — the "draws the switches in the order the store lists them" test's expected list becomes twelve labels: the six existing, then `'آیتم'`, `'جدول'`, `'اندازه‌گیری'`, `'قاعده'`, `'یادداشت'`, `'منبع داده‌ها'` (the mocked policy in that test must serve the six `fact_*` fields too — extend the fixture). Add one test: none of the twelve checkboxes has the accessible description `'تنظیم تازه‌ای که هنوز عنوان فارسی ندارد؛ تا روشن شدن معنای آن خاموش بماند.'`.

- [ ] **Step 2: `cd ui && ./node_modules/.bin/vitest run src/screens/Visibility.test.tsx`** — expect failure.

- [ ] **Step 3: Implement** — append to `ROWS`, in this order (the order the server lists them):

```ts
  { field: 'fact_items', label: 'آیتم',
    hint: 'اقلام داده‌های کمّی: مواد اولیه، محصول‌ها و بسته‌بندی‌ها با کد و واحد شمارش.' },
  { field: 'fact_records', label: 'جدول',
    hint: 'جدول‌ها و فرم‌های ثبت روزانه با ستون‌هایشان.' },
  { field: 'fact_measurements', label: 'اندازه‌گیری',
    hint: 'مقدارهای اندازه‌گیری‌شده: پار، ظرفیت، زمان و مانند آن.' },
  { field: 'fact_rules', label: 'قاعده',
    hint: 'قاعده‌ها و فرمول‌ها: چه چیزی از چه چیزی محاسبه می‌شود.' },
  { field: 'fact_notes', label: 'یادداشت',
    hint: 'یادداشت‌های پیوست‌شده به داده‌های کمّی.' },
  { field: 'fact_sources', label: 'منبع داده‌ها',
    hint: 'استناد هر داده به فایل، جدول یا جلسه‌ای که از آن آمده است.' },
```
and widen `PolicyField` with the six names. Update the `ROWS` doc comment ("The six switches…" → twelve, process, node, then the five fact kinds and their sources).

- [ ] **Step 4: vitest on the file, then `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`, then `npm run build` in the worktree's `ui/` (the dist is what the local compose serves — note `ui/dist` is bind-mounted from main's checkout, so the build that matters is the one after merge).**

- [ ] **Step 5: Commit** — `fix(ui): the six fact switches on the policy screen carry the names the نوع dropdown shows`
