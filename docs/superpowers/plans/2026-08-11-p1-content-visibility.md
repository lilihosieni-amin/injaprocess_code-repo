# P1 — Content Visibility and Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one filter decide what is *inside* every body this service sends, and make a process or a department overview invisible to every non-editor until an Editor has vouched for the exact bytes they read.

**Architecture:** Two facts land in `app.db` (migration 2): a **content fingerprint** per confirmed target, and a **global visibility policy** of six switches. One pure module, `visibility.py`, turns a stored document plus that policy plus one caller-independent link predicate into the body a non-editor may have — and the *same function* builds the published report bundle, so the API and the artifact cannot disagree. `disclosure.Disclosure` keeps its two resolutions and delegates the shaping; the confirmation gate joins the tombstone gate as a whole-record filter at every boundary that serves a reader. The report cache key becomes a digest over the confirmed fingerprints, the overview's fingerprint and the policy version, because a cached artifact that survives a policy change is a content leak rather than a stale page.

**Tech Stack:** FastAPI, stdlib `sqlite3` (no ORM), stdlib `hashlib`/`unicodedata`, pytest + `TestClient`. Frontend: React 19, TypeScript, TanStack Query v5, Vitest, the F design system.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-04-multi-user-rbac-design.md` — decisions **D16, D17, D18, D19, D20, D21, D22, D23, D27, D55, D56, D61**, and `§11` tests 2, 3, 4, 5, 8. Where anything here disagrees, the spec wins.
- Backend tests: `.venv/bin/pytest ui-backend/tests -q` from the repo root. `ui-backend/.venv` lacks pytest.
- Frontend tests: `cd ui && npx vitest run`. Vitest runs `globals: false` — import from `vitest` explicitly.
- **`npm run build` is mandatory frontend verification** — three bugs in an earlier sub-project were invisible to vitest and tsc and visible only to a real build.
- **No hex colours, no `text-[…]`/`rounded-[…]`/`shadow-[…]` under `ui/src/**`, no physical CSS properties** — `ui/src/test/guards.test.ts` enforces this.
- Test idiom: `signed_in_client(data_root, app_db) -> (client, cfg)`, `cfg_for`, `seed_editor`, `seeded_session` from `inja_ui_backend.tests_helpers`. **`base_url="https://testserver"` is load-bearing** — the session cookie is `Secure`.
- No ORM, no new dependencies.
- **Do not touch** `ui/src/flow/**`, `ui/export/**`, `engine/`, or `data-repo`.

### Constraints this sub-project inherits from the code it is changing

- **`db.py` is the only module permitted SQL DDL.** The new tables are **migration 2**, appended to `MIGRATIONS`; `SCHEMA_VERSION = MIGRATIONS[-1][0]` follows automatically. Never edit migration 1.
- **The shared-connection invariant** (`db.connect`'s docstring): the app shares one SQLite connection across FastAPI's threadpool workers, safe **only because no request handler opens an explicit transaction**. Every write added by this plan is a single autocommitted statement. Anything that ever needs atomicity across statements must open its own connection.
- `scopes.contains` is the sole authority on reachability. `storage.dept_of` is a **lexical** projection (`pid.rsplit("-", 1)[0]`) and is used to derive gate targets *before* anything is loaded — never read a department out of a stored document to choose a status code.
- `access.reachable_departments` returns `None` for "every department" and `set()` for "none". They are opposites and both falsy. **Test with `is None`.**
- `access.requires(capability, target)` checks **scope before capability**: 404 outside scope, 403 for a refused action on a visible resource. `access.NOT_FOUND` is the body of every 404.
- **`set_visibility` and `confirm` are `delegable: false`** (`seed.NON_DELEGABLE`). The seed is their only origin; no endpoint added here mints a role.
- **`pending` is emptied, not dropped** — `ui/src/flow/adapt.ts` iterates it with no guard. That convention survives this plan, and generalises: **a field the client dereferences is blanked; a field nothing reads is dropped.**

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `ui-backend/inja_ui_backend/fingerprint.py` | Canonical JSON + SHA-256 over a document, minus D21's four exclusions. Pure, no I/O, no database. |
| `ui-backend/inja_ui_backend/store/confirmations.py` | The `confirmations` table: set, get, revoke, batch lookup. Single-statement writes only. |
| `ui-backend/inja_ui_backend/store/policy.py` | The `visibility_policy` table, D17's field list and defaults, and the policy **version** digest D27 keys on. |
| `ui-backend/inja_ui_backend/visibility.py` | **The one filter.** Pure: `(document, policy, sees, editor) -> body`. Read by every API boundary and by the report bundle. |
| `ui-backend/inja_ui_backend/routers/confirmations.py` | `POST`/`DELETE /api/confirmations/{target}`, `GET /api/confirmations?department=`. |
| `ui-backend/inja_ui_backend/routers/visibility.py` | `GET /api/visibility`, `PUT /api/visibility/{field}`. |
| `ui-backend/tests/test_fingerprint.py`, `test_confirmations_store.py`, `test_policy_store.py`, `test_visibility.py`, `test_confirmations_api.py`, `test_visibility_api.py`, `test_confirmation_gate.py` | Backend tests. |
| `ui/src/write/ConfirmMark.tsx` (+ `.test.tsx`) | The confirmation mark and its two actions. |
| `ui/src/screens/Visibility.tsx` (+ `.test.tsx`) | The six switches. |

**Modified:** `db.py` (migration 2), `disclosure.py` (delegates the shaping; gains the record gate), `exports.py` (one filter, the D27 key), `routers/{departments,processes,pending,exports}.py`, `models.py`, `app.py`; `ui/src/api/{types,hooks}.ts`, `ui/src/routes.tsx`, `ui/src/shell/PanelShell.tsx`, `ui/src/screens/{Overview,ProcessList,Summary}.tsx`; and `ui-backend/tests/{test_body_scan,test_endpoint_matrix,test_exports,test_exports_api,test_db}.py`.

**A note on where the decision lives.** `access` decides *whether* a document is served. `visibility` decides *what is in it*. `disclosure` is the one place that resolves a caller into the arguments both need, and it is deliberately the only module that knows about both. P0b's final review found the same class of bug three times because nothing between the gate and `return doc` decided what was in it; this plan's answer is that exactly one function shapes a body, and every boundary calls it.

---

### Task 1: Migration 2 — the two tables

**Files:**
- Modify: `ui-backend/inja_ui_backend/db.py:14-69` (append to `MIGRATIONS`)
- Modify: `ui-backend/tests/test_db.py`

**Interfaces:**
- Produces: tables `confirmations(target, fingerprint, confirmed_by, confirmed_at)` and `visibility_policy(field, visible)`; `db.SCHEMA_VERSION == 2`.
- Consumed by: Task 3 (`store/confirmations.py`), Task 4 (`store/policy.py`).

- [ ] **Step 1: Write the failing test**

Append to `ui-backend/tests/test_db.py`:

```python
def test_migration_2_creates_the_confirmation_and_policy_tables(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    assert db.migrate(conn) == 2
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(confirmations)")}
    assert cols == {"target", "fingerprint", "confirmed_by", "confirmed_at"}
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(visibility_policy)")}
    assert cols == {"field", "visible"}


def test_a_database_at_version_1_upgrades_without_losing_its_rows(tmp_path):
    """The upgrade path, not just the fresh-create path.

    `migrate` runs on every start, so the only interesting case is a store that
    already holds accounts: a migration 2 that dropped or recreated anything from
    migration 1 would take the restaurant's users with it, and a fresh-database
    test cannot see that.
    """
    path = tmp_path / "app.db"
    conn = db.connect(path)
    # Migration 1 alone, as a database shipped before this sub-project.
    version, sql = db.MIGRATIONS[0]
    conn.executescript(f"BEGIN;\n{sql}\nINSERT INTO schema_version (version)"
                       f" VALUES ({version});\nCOMMIT;")
    conn.execute("INSERT INTO roles (name, capabilities) VALUES ('editor', '[]')")
    rid = conn.execute("SELECT id FROM roles WHERE name='editor'").fetchone()[0]
    conn.execute("INSERT INTO users (username, display_name, password_hash, role_id)"
                 " VALUES ('09120000000', 'e', 'h', ?)", (rid,))

    assert db.migrate(conn) == 2
    assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM confirmations").fetchone()[0] == 0


def test_the_system_starts_dark(tmp_path):
    """D23 — no bulk confirmation at migration.

    All 85 existing processes start unconfirmed, so a non-editor sees an empty
    system until an Editor reviews each one. The migration must therefore write
    **no** confirmation rows, and this is where that is pinned: a well-meaning
    `INSERT ... SELECT` added later to "avoid disruption" would make every stored
    document vouched-for by nobody.
    """
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    assert conn.execute("SELECT COUNT(*) FROM confirmations").fetchone()[0] == 0
    # And the policy table is empty too: the defaults live in Python (Task 4), so
    # a seeded row would be a second statement of D17's table.
    assert conn.execute("SELECT COUNT(*) FROM visibility_policy").fetchone()[0] == 0


def test_a_confirmation_target_is_unique(tmp_path):
    """One confirmation per target, replaced rather than accumulated (D20).

    Without the primary key, re-confirming after an edit leaves two rows and
    "does the current fingerprint match?" has two answers, one of which is stale.
    """
    import sqlite3

    import pytest
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    conn.execute("INSERT INTO confirmations VALUES ('dining-001', 'aa', '0912', 1)")
    with pytest.raises(sqlite3.IntegrityError):
        conn.execute("INSERT INTO confirmations VALUES ('dining-001', 'bb', '0912', 2)")
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_db.py -q`
Expected: FAIL — `db.migrate` returns `1`, and `PRAGMA table_info(confirmations)` yields an empty set.

- [ ] **Step 3: Append migration 2**

In `ui-backend/inja_ui_backend/db.py`, add a second entry to `MIGRATIONS`, immediately after the `(1, """…""")` tuple and before the closing `]`:

```python
    (2, """
        CREATE TABLE confirmations (
            -- A process id ('dining-001') or a department code ('dining').
            -- One column for both because the two namespaces are disjoint by
            -- construction: a department code carries no '-', a process id
            -- always does. D20 says the target is "a process id or a department
            -- code"; splitting it into two tables would give the same question
            -- two places to be answered and two places to forget one.
            target       TEXT PRIMARY KEY,
            -- The SHA-256 of the canonical form of what was confirmed (D21).
            -- Never a boolean: a boolean would have to be cleared correctly by
            -- the UI's Save, a chat edit and a `merge` run, and missing one
            -- leaves the mark vouching for something stale.
            fingerprint  TEXT NOT NULL,
            confirmed_by TEXT NOT NULL,           -- username
            confirmed_at INTEGER NOT NULL         -- unix seconds
        );

        CREATE TABLE visibility_policy (
            -- One row per *changed* switch. An absent row reads as D17's
            -- default (store/policy.py), so the defaults are stated once, in
            -- Python, rather than once here and once there.
            field   TEXT PRIMARY KEY,
            visible INTEGER NOT NULL CHECK (visible IN (0, 1))
        );
    """),
```

**Deliberately no rows are inserted.** D23: the system starts dark, so `confirmations` is empty and all 85 existing processes are unconfirmed. `visibility_policy` is empty because Task 4's `DEFAULTS` is the only statement of D17's defaults.

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_db.py -q`
Expected: PASS.

- [ ] **Step 5: Run the whole backend suite**

Run: `.venv/bin/pytest ui-backend/tests -q`
Expected: `665 passed, 3 skipped` plus the four new tests — `669 passed, 3 skipped`.

- [ ] **Step 6: Commit**

```bash
git add ui-backend/inja_ui_backend/db.py ui-backend/tests/test_db.py
git commit -m "feat(backend): migration 2 — confirmations and the visibility policy

One target column for both a process id and a department code: the namespaces
are disjoint (a department code carries no hyphen), and two tables would give
'is this confirmed?' two places to answer it.

No rows are written. D23 — the system starts dark, so every existing process is
unconfirmed until an Editor reviews it, and the policy defaults live in Python
so D17's table is stated exactly once."
```

---

### Task 2: The fingerprint

**Files:**
- Create: `ui-backend/inja_ui_backend/fingerprint.py`, `ui-backend/tests/test_fingerprint.py`

**Interfaces:**
- Produces: `EXCLUDED: frozenset[str]`, `canonical(value) -> object`, `canonical_json(doc: dict) -> str`, `fingerprint(doc: dict) -> str` (64 lowercase hex chars).
- Consumed by: Tasks 3, 7, 8, 10, and the report key.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_fingerprint.py`:

```python
"""What does and does not invalidate a confirmation (spec §11 test 15, D21)."""
import copy
import json

from inja_ui_backend.fingerprint import EXCLUDED, canonical_json, fingerprint


def _doc() -> dict:
    """A process with every field D21 mentions actually populated.

    Populated on purpose. A stub with `source: {}` and no `pending` cannot tell a
    working exclusion list from a missing one — every assertion below would pass
    against a `fingerprint` that hashed the whole document.
    """
    return {
        "id": "dining-001", "department": "dining", "name": "پذیرایی از مهمان",
        "summary": "خلاصهٔ داخلی",
        "source": {"type": "voice", "ref": "meetings/a.m4a", "run": "runs/chat/1"},
        "parent": None,
        "created_at": "2026-07-06T10:00:00Z", "updated_at": "2026-07-06T10:00:00Z",
        "idef0": {"inputs": ["سفارش"], "controls": [], "outputs": [], "mechanisms": []},
        "kpis": [{"name": "زمان انتظار", "target": "۵ دقیقه"}],
        "nodes": [
            {"id": "dining-001-n010", "type": "activity", "label": "خوش‌آمدگویی",
             "description": "توضیح", "actor": "میزبان",
             "icom": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
             "subprocess": None, "position": {"x": 160, "y": 90}, "layout": "auto",
             "source": {"created_by": "runs/chat/1", "touched_by": []}},
        ],
        "edges": [{"from": "dining-001-n010", "to": "end", "label": ""}],
        "pending": [{"node": "dining-001-n010", "field": "actor", "current": "میزبان",
                     "proposed": "پیشخدمت", "source": "runs/chat/2", "status": "open"}],
    }


# --- the riskiest half first: a fingerprint that does not change when it must ---

def test_moving_a_node_changes_the_fingerprint():
    """D21 names this one explicitly: the diagram's appearance is part of the
    document, so a re-layout un-confirms the process."""
    a = _doc()
    b = copy.deepcopy(a)
    b["nodes"][0]["position"] = {"x": 161, "y": 90}
    assert fingerprint(a) != fingerprint(b)


def test_editing_a_node_label_changes_the_fingerprint():
    a = _doc()
    b = copy.deepcopy(a)
    b["nodes"][0]["label"] = "خوش‌آمدگویی و راهنمایی"
    assert fingerprint(a) != fingerprint(b)


def test_editing_a_policy_hidden_field_still_changes_the_fingerprint():
    """The fingerprint is **independent of the visibility policy**.

    D21's four exclusions are fixed. `summary`, `idef0`, `kpis` and a node's
    `icom` are hidden from a non-editor *by default* — but they are switchable
    (D17), and a fingerprint that skipped whatever the policy currently hides
    would (a) mean every confirmation in the system changes meaning when a switch
    is flipped, and (b) let an Editor's edit to a hidden summary keep a
    confirmation that no longer describes the document.
    """
    for field, value in (("summary", "خلاصهٔ تازه"),
                         ("kpis", [{"name": "دیگر"}])):
        a = _doc()
        b = copy.deepcopy(a)
        b[field] = value
        assert fingerprint(a) != fingerprint(b), field
    a = _doc()
    b = copy.deepcopy(a)
    b["nodes"][0]["icom"] = {"inputs": ["ورودی"], "controls": [], "outputs": [],
                             "mechanisms": []}
    assert fingerprint(a) != fingerprint(b)


def test_a_new_node_changes_the_fingerprint():
    a = _doc()
    b = copy.deepcopy(a)
    b["nodes"].append({"id": "dining-001-n020", "type": "activity", "label": "تسویه",
                       "description": "", "actor": "", "subprocess": None,
                       "icom": {"inputs": [], "controls": [], "outputs": [],
                                "mechanisms": []},
                       "position": {"x": 300, "y": 90}, "layout": "auto",
                       "source": {"created_by": "ui", "touched_by": []}})
    assert fingerprint(a) != fingerprint(b)


# --- the other half: a fingerprint that changes when it must not ---

def test_a_pipeline_run_touching_provenance_does_not_change_it():
    """ARD §5.3 appends to `source.touched_by` for processes a run decided were
    **unchanged**. Counted, every voice run would un-confirm the entire
    department including the processes it deliberately left alone."""
    a = _doc()
    b = copy.deepcopy(a)
    b["source"]["run"] = "runs/chat/20260811-090000"
    b["source"]["touched_by"] = ["merge"]
    b["nodes"][0]["source"]["touched_by"] = ["merge"]
    b["updated_at"] = "2026-08-11T09:00:00Z"
    assert fingerprint(a) == fingerprint(b)


def test_resolving_a_pending_conflict_does_not_change_it():
    """Accepting or rejecting a proposal changes no visible byte of the
    flowchart. `pending` is on D17's never-shown list, so it is outside the
    fingerprint and outside what a confirmation vouches for."""
    a = _doc()
    b = copy.deepcopy(a)
    b["pending"][0]["status"] = "rejected"
    assert fingerprint(a) == fingerprint(b)
    c = copy.deepcopy(a)
    c["pending"] = []
    assert fingerprint(a) == fingerprint(c)


def test_tombstoning_does_not_change_it():
    a = _doc()
    b = copy.deepcopy(a)
    b["tombstoned"] = True
    assert fingerprint(a) == fingerprint(b)


def test_key_order_and_indentation_do_not_change_it():
    """Why canonical rather than raw bytes (D21).

    Two programs write these files — `ui-backend`'s `storage.write_json_atomic`
    (indent 2) and the `merge` CLI in `engine/` — so hashing bytes would make a
    confirmation depend on which program last wrote the file, and any difference
    in indent or key order would silently un-confirm everything the pipeline
    touched. Round-tripping through two different serialisations is the check.
    """
    a = _doc()
    reversed_keys = dict(reversed(list(a.items())))
    dense = json.loads(json.dumps(reversed_keys, ensure_ascii=False,
                                  separators=(",", ":")))
    indented = json.loads(json.dumps(a, ensure_ascii=False, indent=4))
    assert fingerprint(a) == fingerprint(dense) == fingerprint(indented)


def test_persian_text_is_nfc_normalised():
    """The same word, composed and decomposed, is the same content.

    U+0622 ARABIC LETTER ALEF WITH MADDA ABOVE, against its decomposition
    U+0627 + U+0653. Written as escapes so the file cannot be "fixed" by an
    editor silently normalising it — which is exactly what would make this test
    pass against an implementation that does no normalisation at all.
    """
    a = _doc()
    a["name"] = "آب"          # آب, composed
    b = copy.deepcopy(a)
    b["name"] = "آب"    # the same word, decomposed
    assert a["name"] != b["name"]       # the inputs really do differ
    assert fingerprint(a) == fingerprint(b)


def test_the_canonical_form_carries_no_excluded_key_at_any_depth():
    assert EXCLUDED == {"updated_at", "source", "pending", "tombstoned"}
    text = canonical_json(_doc())
    for key in EXCLUDED:
        assert f'"{key}"' not in text, key
    # …and is not simply empty: the exclusion is a filter, not a bulldozer.
    assert '"nodes"' in text and '"position"' in text


def test_the_fingerprint_is_sixty_four_hex_characters_and_stable():
    a = fingerprint(_doc())
    assert a == fingerprint(_doc())
    assert len(a) == 64
    assert all(c in "0123456789abcdef" for c in a)


def test_it_does_not_mutate_its_argument():
    doc = _doc()
    before = json.dumps(doc, ensure_ascii=False, sort_keys=True)
    fingerprint(doc)
    assert json.dumps(doc, ensure_ascii=False, sort_keys=True) == before


def test_a_department_overview_fingerprints_too():
    """One function for both targets (D20): the overview is confirmed the same
    way, and its `updated_at` falls out under the same exclusion."""
    ov = {"department": "dining", "name": "سالن", "description": "شرح",
          "sub_units": [], "personnel": [{"role": "میزبان", "duties": ["راهنمایی"],
                                          "kpi": ["رضایت"]}],
          "updated_at": "2026-07-06T10:00:00Z"}
    other = dict(ov, updated_at="2026-08-11T09:00:00Z")
    assert fingerprint(ov) == fingerprint(other)
    changed = dict(ov, description="شرح تازه")
    assert fingerprint(ov) != fingerprint(changed)
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_fingerprint.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'inja_ui_backend.fingerprint'`.

- [ ] **Step 3: Write the module**

Create `ui-backend/inja_ui_backend/fingerprint.py`:

```python
"""The content fingerprint (spec D20, D21).

A confirmation is a fingerprint, never a boolean. A boolean would have to be
cleared correctly by all three write paths — the UI's Save, a chat edit via
Telegram, and a pipeline `merge` run — and missing one would leave the mark
vouching for something stale, which is the exact failure the mark exists to
prevent. A fingerprint self-invalidates for every path, including paths added
later, with no change to `merge` and no field on `process.json`.

**Canonical, not raw bytes.** Two programs write these files — `ui-backend`'s
`storage.write_json_atomic` (`indent=2`) and the `merge` CLI in `engine/` — so
hashing the file's bytes would make a confirmation depend on which program last
wrote it, and any difference in indent, key order or spacing would silently
un-confirm every process the pipeline touched.

**The four exclusions, and why the line is there.** A confirmation vouches for
what a *reader* sees, so it is invalidated by changes a reader could notice.
`updated_at`, `source` (including `touched_by`), `pending` and `tombstoned` are
D17's never-shown block: internal bookkeeping, not content. Without the
exclusions, ARD §5.3's `source.touched_by` record — added for processes a run
decided were **unchanged** — would un-confirm an entire department on every voice
run, and accepting a `pending` conflict would un-confirm a flowchart without
changing one visible byte of it. Both would be invisible to whoever was surprised
by them.

**It is independent of the visibility policy, and must stay so.** `summary`,
`idef0`, `kpis` and node `icom` are hidden from a non-editor by default but are
switchable (D17), so a fingerprint that skipped whatever is currently hidden
would change meaning the moment a switch moved — every confirmation in the
system, at once, for a change to no document.

**Node positions count**, so moving a node or running the re-layout un-confirms
the process: the diagram's appearance is part of the document.

Pure: no database, no filesystem, and nothing here mutates its argument.
"""
from __future__ import annotations

import hashlib
import json
import unicodedata

#: Excluded from the hash **at every depth**, not only at the top level.
#:
#: `source` appears twice in a process document — once for the process and once
#: per node — and both are provenance a pipeline run rewrites for documents it
#: left otherwise alone. One rule for the key wherever it occurs is also the
#: rule that cannot be got half right.
EXCLUDED: frozenset[str] = frozenset({"updated_at", "source", "pending",
                                      "tombstoned"})


def canonical(value):
    """`value` with the excluded keys gone and every string NFC-normalised.

    Persian text arrives from three keyboards and two pipelines, so the same word
    can be stored composed or decomposed. NFC is applied to keys as well as
    values: a decomposed key would sort differently and hash differently while
    naming the same field.
    """
    if isinstance(value, dict):
        return {unicodedata.normalize("NFC", k): canonical(v)
                for k, v in value.items() if k not in EXCLUDED}
    if isinstance(value, list):
        return [canonical(v) for v in value]
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    return value


def canonical_json(doc: dict) -> str:
    """The exact text that gets hashed. Public so a test can read it.

    `sort_keys` gives key order that no writer can influence; `separators`
    removes every insignificant space; `ensure_ascii=False` keeps Persian text as
    itself rather than as `\\uXXXX` escapes, so the hash is over the words and not
    over one library's escaping habits.

    Numbers are left to `json.dumps`, which is deterministic for a given Python
    value — and both writers read the document back off disk before it ever
    reaches here, so an int stays an int and a float stays a float through the
    round trip.
    """
    return json.dumps(canonical(doc), sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False)


def fingerprint(doc: dict) -> str:
    """SHA-256 of the canonical form — 64 lowercase hex characters."""
    return hashlib.sha256(canonical_json(doc).encode("utf-8")).hexdigest()
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_fingerprint.py -q`
Expected: PASS — 12 tests.

- [ ] **Step 5: Prove the exclusion list is load-bearing**

Temporarily change `EXCLUDED` to `frozenset()` and re-run. Expected: `test_a_pipeline_run_touching_provenance_does_not_change_it`, `test_resolving_a_pending_conflict_does_not_change_it` and `test_tombstoning_does_not_change_it` all **fail**. Then set it to `frozenset({"updated_at", "source", "pending", "tombstoned", "position"})` and re-run: `test_moving_a_node_changes_the_fingerprint` **fails**. Revert both. Report that you did this — an exclusion list nothing tests in both directions is a list that will grow by accident.

- [ ] **Step 6: Commit**

```bash
git add ui-backend/inja_ui_backend/fingerprint.py ui-backend/tests/test_fingerprint.py
git commit -m "feat(backend): a confirmation is a fingerprint, not a boolean

SHA-256 over canonical JSON — keys sorted, no insignificant whitespace,
ensure_ascii=False, Persian text NFC-normalised — minus updated_at, source,
pending and tombstoned at every depth.

Canonical rather than raw bytes because two programs write these files and any
indent or key-order difference would silently un-confirm everything the pipeline
touched. Node positions count, so a re-layout un-confirms. The four exclusions
are exactly D17's never-shown block, which is what makes the mark mean 'this is
what a reader sees' — without them every voice run would un-confirm a whole
department including the processes it deliberately left alone.

Independent of the visibility policy: switchable fields are hashed even while
hidden, or flipping one switch would change the meaning of every confirmation in
the system at once."
```

---

### Task 3: The confirmation store

**Files:**
- Create: `ui-backend/inja_ui_backend/store/confirmations.py`, `ui-backend/tests/test_confirmations_store.py`

**Interfaces:**
- Consumes: migration 2's `confirmations` table; `fingerprint.fingerprint`.
- Produces:
  - `set_confirmation(conn, *, target: str, fingerprint: str, by: str, at: int) -> None`
  - `get(conn, target: str) -> sqlite3.Row | None`
  - `revoke(conn, target: str) -> bool` (True when a row was removed)
  - `stored_for(conn, targets: Iterable[str]) -> dict[str, str]` — target → stored fingerprint, one query.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_confirmations_store.py`:

```python
from inja_ui_backend import db
from inja_ui_backend.store import confirmations


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    return conn


def test_a_confirmation_round_trips(tmp_path):
    conn = _conn(tmp_path)
    confirmations.set_confirmation(conn, target="dining-001", fingerprint="a" * 64,
                                   by="09120000000", at=1770000000)
    row = confirmations.get(conn, "dining-001")
    assert row["fingerprint"] == "a" * 64
    assert row["confirmed_by"] == "09120000000"
    assert row["confirmed_at"] == 1770000000


def test_an_unconfirmed_target_is_none_not_an_error(tmp_path):
    assert confirmations.get(_conn(tmp_path), "dining-001") is None


def test_re_confirming_replaces_rather_than_accumulates(tmp_path):
    """The whole point of the mark is that there is one answer to 'does the
    current fingerprint match?'. Two rows would give two."""
    conn = _conn(tmp_path)
    confirmations.set_confirmation(conn, target="dining-001", fingerprint="a" * 64,
                                   by="09120000000", at=1770000000)
    confirmations.set_confirmation(conn, target="dining-001", fingerprint="b" * 64,
                                   by="09120000001", at=1770000900)
    assert conn.execute("SELECT COUNT(*) FROM confirmations").fetchone()[0] == 1
    row = confirmations.get(conn, "dining-001")
    assert (row["fingerprint"], row["confirmed_by"], row["confirmed_at"]) == (
        "b" * 64, "09120000001", 1770000900)


def test_revoke_reports_whether_there_was_anything_to_revoke(tmp_path):
    """D61 — withdrawing is a deliberate act with an event of its own, so the
    caller has to be able to tell 'I withdrew one' from 'there was none': the
    second must not write a `confirmation.revoked` row about nothing."""
    conn = _conn(tmp_path)
    confirmations.set_confirmation(conn, target="dining", fingerprint="c" * 64,
                                   by="09120000000", at=1770000000)
    assert confirmations.revoke(conn, "dining") is True
    assert confirmations.get(conn, "dining") is None
    assert confirmations.revoke(conn, "dining") is False


def test_a_process_and_a_department_are_separate_targets(tmp_path):
    """One table for both (D20, D55). `dining` and `dining-001` must not collide
    — a department code carries no hyphen and a process id always does, so the
    two namespaces are disjoint and a shared key is unambiguous."""
    conn = _conn(tmp_path)
    confirmations.set_confirmation(conn, target="dining", fingerprint="c" * 64,
                                   by="09120000000", at=1)
    confirmations.set_confirmation(conn, target="dining-001", fingerprint="d" * 64,
                                   by="09120000000", at=2)
    assert confirmations.get(conn, "dining")["fingerprint"] == "c" * 64
    assert confirmations.get(conn, "dining-001")["fingerprint"] == "d" * 64


def test_stored_for_answers_many_targets_in_one_query(tmp_path):
    conn = _conn(tmp_path)
    confirmations.set_confirmation(conn, target="dining-001", fingerprint="a" * 64,
                                   by="u", at=1)
    confirmations.set_confirmation(conn, target="dining-003", fingerprint="c" * 64,
                                   by="u", at=1)
    # dining-002 is deliberately absent, and dining-009 was never asked about:
    # a lookup that returned every row in the table would pass a test that only
    # checked the ones it planted.
    confirmations.set_confirmation(conn, target="dining-009", fingerprint="z" * 64,
                                   by="u", at=1)
    got = confirmations.stored_for(conn, ["dining-001", "dining-002", "dining-003"])
    assert got == {"dining-001": "a" * 64, "dining-003": "c" * 64}


def test_stored_for_asks_nothing_when_there_is_nothing_to_ask(tmp_path):
    """An empty department must not build `... IN ()`, which is a syntax error."""
    assert confirmations.stored_for(_conn(tmp_path), []) == {}


def test_the_writes_open_no_transaction(tmp_path):
    """`db.connect`'s invariant: the app shares one connection across FastAPI's
    threadpool, and it is safe only while no handler opens an explicit
    transaction. Both writes here are single autocommitted statements."""
    conn = _conn(tmp_path)
    confirmations.set_confirmation(conn, target="dining-001", fingerprint="a" * 64,
                                   by="u", at=1)
    assert not conn.in_transaction
    confirmations.revoke(conn, "dining-001")
    assert not conn.in_transaction
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_confirmations_store.py -q`
Expected: FAIL — `ImportError: cannot import name 'confirmations' from 'inja_ui_backend.store'`.

- [ ] **Step 3: Write the module**

Create `ui-backend/inja_ui_backend/store/confirmations.py`:

```python
"""Who vouched for what, and for which exact bytes (spec D20, D61).

`(target, fingerprint, confirmed_by, confirmed_at)` where target is a process id
or a department code. A target displays as confirmed only while its **current**
fingerprint matches the stored one — so nothing in this module has to be cleared
by an editor, a chat edit or a `merge` run. The row simply stops matching.

Every write here is a single autocommitted statement. That is not an accident:
the app shares one sqlite connection across FastAPI's threadpool workers, and
`db.connect`'s invariant is that no request handler may open an explicit
transaction on it.
"""
from __future__ import annotations

import sqlite3
from typing import Iterable


def set_confirmation(conn: sqlite3.Connection, *, target: str, fingerprint: str,
                     by: str, at: int) -> None:
    """Vouch for `target` at exactly `fingerprint`, replacing any earlier mark.

    Upsert rather than insert, because there is one answer to "does the current
    fingerprint match?" and two rows would give two — one of them stale, which is
    the failure the fingerprint exists to prevent. Re-confirming after an edit is
    the ordinary path, not the exception.
    """
    conn.execute(
        "INSERT INTO confirmations (target, fingerprint, confirmed_by, confirmed_at)"
        " VALUES (?, ?, ?, ?)"
        " ON CONFLICT(target) DO UPDATE SET"
        " fingerprint = excluded.fingerprint,"
        " confirmed_by = excluded.confirmed_by,"
        " confirmed_at = excluded.confirmed_at",
        (target, fingerprint, by, at))


def get(conn: sqlite3.Connection, target: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT target, fingerprint, confirmed_by, confirmed_at"
        " FROM confirmations WHERE target = ?", (target,)).fetchone()


def revoke(conn: sqlite3.Connection, target: str) -> bool:
    """Withdraw the mark. True when there was one to withdraw.

    The boolean is what lets the caller tell D61's two events apart at the point
    they are written: `confirmation.revoked` is *"the editor decided this was
    wrong"*, and recording one for a target that was never confirmed would put a
    decision in the record that nobody made.
    """
    return conn.execute("DELETE FROM confirmations WHERE target = ?",
                        (target,)).rowcount > 0


def stored_for(conn: sqlite3.Connection,
               targets: Iterable[str]) -> dict[str, str]:
    """The stored fingerprint of each of `targets` that has one — one query.

    A listing asks this about every process in a department, and D56 wants the
    unconfirmed ones *filtered rather than post-filtered*: resolving the whole
    department in one statement is what keeps "which records exist for you" a
    single decision rather than 38 round trips inside a loop.

    A target with no row is simply absent from the result, so the caller's
    comparison (`stored.get(pid) == fingerprint(doc)`) is `None == "…"` and fails
    closed for an unconfirmed target and for a nonsense one alike.

    The largest department has 38 processes, so the parameter list is nowhere
    near sqlite's limit (999 on builds before 3.32, 32766 after).
    """
    ids = list(targets)
    if not ids:
        # `... IN ()` is a syntax error, and an empty department is ordinary.
        return {}
    marks = ",".join("?" * len(ids))
    rows = conn.execute(
        f"SELECT target, fingerprint FROM confirmations WHERE target IN ({marks})",
        ids)
    return {r["target"]: r["fingerprint"] for r in rows}
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_confirmations_store.py -q`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/store/confirmations.py ui-backend/tests/test_confirmations_store.py
git commit -m "feat(backend): the confirmation store

Upsert, so re-confirming after an edit replaces the mark rather than leaving two
rows with two answers to 'does the current fingerprint match?'.

revoke() reports whether anything was withdrawn, because D61's two events are
different facts: 'the editor decided this was wrong' must not be recorded about
a target nobody had confirmed.

stored_for() resolves a whole department in one statement — D56 wants unconfirmed
records filtered in the query, not post-filtered in a loop."
```

---

### Task 4: The policy store and its defaults

**Files:**
- Create: `ui-backend/inja_ui_backend/store/policy.py`, `ui-backend/tests/test_policy_store.py`

**Interfaces:**
- Consumes: migration 2's `visibility_policy` table.
- Produces:
  - `FIELDS: tuple[str, ...]` — the six switchable fields, in display order.
  - `DEFAULTS: dict[str, bool]` — D17's non-editor defaults.
  - `current(conn) -> dict[str, bool]` — every field in `FIELDS`, resolved.
  - `set_field(conn, field: str, visible: bool) -> bool` — stores it, returns the **previous** value (which D19's event needs).
  - `version(conn) -> str` — 16 hex chars, the policy's identity; D27 keys the report cache on it.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_policy_store.py`:

```python
import pytest

from inja_ui_backend import db
from inja_ui_backend.store import policy


def _conn(tmp_path):
    conn = db.connect(tmp_path / "app.db")
    db.migrate(conn)
    return conn


def test_the_defaults_are_exactly_d17s_table(tmp_path):
    """The whole point of the defaults is that nothing becomes visible at
    migration that is not visible today, so they are pinned as an equality
    rather than as six `in` checks — a seventh field added without a decision
    fails here."""
    assert policy.current(_conn(tmp_path)) == {
        "node_description": True,
        "node_actor": True,
        "process_summary": False,
        "process_idef0": False,
        "process_kpis": False,
        "node_icom": False,
    }
    assert set(policy.FIELDS) == set(policy.DEFAULTS)
    assert len(policy.FIELDS) == 6


def test_an_absent_row_reads_as_its_default(tmp_path):
    conn = _conn(tmp_path)
    policy.set_field(conn, "process_summary", True)
    got = policy.current(conn)
    assert got["process_summary"] is True
    # The other five never got a row and must still answer.
    assert got["node_actor"] is True and got["node_icom"] is False


def test_set_field_returns_the_value_it_replaced(tmp_path):
    """D19 records the actor, the field and **both values**. The previous value
    exists nowhere else once the row is written, so the writer has to hand it
    back or the event can only ever say half of what D19 asks for."""
    conn = _conn(tmp_path)
    assert policy.set_field(conn, "node_actor", False) is True     # was the default
    assert policy.set_field(conn, "node_actor", True) is False     # was the stored 0
    assert policy.set_field(conn, "node_actor", True) is True      # unchanged


def test_an_unknown_field_is_refused_at_the_data_layer(tmp_path):
    conn = _conn(tmp_path)
    with pytest.raises(ValueError):
        policy.set_field(conn, "node_kpis", True)
    # A node has no KPIs (D17): `process.kpis[]` and `overview.personnel[].kpi[]`
    # are the only two KPI fields in the model, and neither is a node's.
    assert "node_kpis" not in policy.FIELDS
    assert conn.execute("SELECT COUNT(*) FROM visibility_policy").fetchone()[0] == 0


def test_a_stray_row_for_a_field_that_no_longer_exists_is_ignored(tmp_path):
    """`FIELDS` is the vocabulary, the table is only storage. A row left behind
    by a removed switch must not appear in the policy or in its version, or a
    hand-edited database would change what every report contains."""
    conn = _conn(tmp_path)
    conn.execute("INSERT INTO visibility_policy (field, visible) VALUES ('gone', 1)")
    assert "gone" not in policy.current(conn)


def test_the_version_changes_when_the_policy_changes(tmp_path):
    """§11 test 22's first clause, at the store. If this fails, a cached report
    is served under a policy it was not built under — a content leak, not a
    stale page."""
    conn = _conn(tmp_path)
    before = policy.version(conn)
    policy.set_field(conn, "node_actor", False)
    assert policy.version(conn) != before


def test_the_version_is_the_policy_and_not_its_history(tmp_path):
    """Undoing a change returns the old version, and that is correct rather than
    a weakness: the version exists to say **which policy an artifact was built
    under**, and a report built under 'actor visible' is still right for 'actor
    visible'. A counter would force a re-render of every department for a change
    that changed nothing."""
    conn = _conn(tmp_path)
    before = policy.version(conn)
    policy.set_field(conn, "node_actor", False)
    policy.set_field(conn, "node_actor", True)
    assert policy.version(conn) == before


def test_the_version_is_stable_across_connections(tmp_path):
    """A digest over the policy, never over anything per-process: two workers
    must key the same artifact the same way."""
    conn = _conn(tmp_path)
    policy.set_field(conn, "process_kpis", True)
    v = policy.version(conn)
    other = db.connect(tmp_path / "app.db")
    assert policy.version(other) == v
    assert len(v) == 16 and all(c in "0123456789abcdef" for c in v)


def test_the_write_opens_no_transaction(tmp_path):
    conn = _conn(tmp_path)
    policy.set_field(conn, "process_kpis", True)
    assert not conn.in_transaction
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_policy_store.py -q`
Expected: FAIL — `ImportError: cannot import name 'policy' from 'inja_ui_backend.store'`.

- [ ] **Step 3: Write the module**

Create `ui-backend/inja_ui_backend/store/policy.py`:

```python
"""The content-visibility policy (spec D16, D17, D19).

**One global policy, and deliberately not a grant.** What is shown of a process
applies identically to every non-editor: not per-role, not per-department, not
per-user. If field visibility were an ordinary capability, anyone holding
`manage_users` could confer it and internal content would leave the system
without an Editor deciding. `set_visibility` is `delegable: false` (D50), so no
role holding it can be created through any API path — stronger than restricting
the action to a privileged account, because it depends on no account's identity.

What varies between users is *which departments and reports they can reach* —
never *which fields*.

**The department overview is not here** (D55). It is shown in its entirety, with
no per-field switches and no policy table; only scope and confirmation gate it.
If a reason to hide part of it ever appears, it becomes new rows in `FIELDS`
rather than a new mechanism.

**A node has no KPIs.** The two KPI fields in the data model are `process.kpis[]`
(here, as `process_kpis`) and `overview.personnel[].kpi[]` (D55's, and not
switchable). What a node carries is ICOM — IDEF0 information, not a performance
indicator — which is why `node_icom` and `process_kpis` are separate switches.

Defaults live in Python and the table holds only what has been *changed*, so
D17's table is stated exactly once. A migration that seeded the defaults would
state them twice, and the day one moved the two would disagree with no test able
to see which was authoritative.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3

#: The six switchable fields of D17, in the order the policy screen lists them:
#: the process's own record first, then a node's.
FIELDS: tuple[str, ...] = (
    "process_summary",
    "process_idef0",
    "process_kpis",
    "node_description",
    "node_actor",
    "node_icom",
)

#: D17's non-editor defaults. They match what the export publishes today, so
#: nothing becomes visible at migration that is not visible now.
DEFAULTS: dict[str, bool] = {
    "process_summary": False,
    "process_idef0": False,
    "process_kpis": False,
    "node_description": True,
    "node_actor": True,
    "node_icom": False,
}


def current(conn: sqlite3.Connection) -> dict[str, bool]:
    """Every switch, resolved: the stored value where there is one, else D17's.

    Keyed off `FIELDS` rather than off the rows, so a row left behind by a switch
    that no longer exists is ignored rather than added to the policy — the
    vocabulary is the code's, and the table is only storage.
    """
    stored = {r["field"]: bool(r["visible"]) for r in
              conn.execute("SELECT field, visible FROM visibility_policy")}
    return {f: stored.get(f, DEFAULTS[f]) for f in FIELDS}


def set_field(conn: sqlite3.Connection, field: str, visible: bool) -> bool:
    """Store `field`'s new value; return the value it replaced.

    The previous value exists nowhere else once the row is written, and D19 wants
    the actor, the field **and both values** — so it is returned here rather than
    re-read by the caller, where a read-after-write would race itself.

    `ValueError` for a field nobody declared, even though the router checks the
    same thing first: this is the data layer, and a guard that only exists in one
    HTTP handler is a guard the second handler forgets.
    """
    if field not in DEFAULTS:
        raise ValueError(f"not a visibility policy field: {field!r}")
    before = current(conn)[field]
    conn.execute(
        "INSERT INTO visibility_policy (field, visible) VALUES (?, ?)"
        " ON CONFLICT(field) DO UPDATE SET visible = excluded.visible",
        (field, 1 if visible else 0))
    return before


def version(conn: sqlite3.Connection) -> str:
    """The policy's identity — 16 hex chars. D27's third key ingredient.

    A **digest of the policy**, not a counter of changes, and the distinction is
    the point: the version exists to say which policy an artifact was built
    under, so switching a field off and back on must return to the old version.
    A counter would force every department's report to be regenerated for a
    change that changed nothing a reader can see.

    Derived from `current`, so it covers exactly the declared fields and a stray
    row cannot move it.
    """
    body = json.dumps(current(conn), sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(body.encode("utf-8")).hexdigest()[:16]
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_policy_store.py -q`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add ui-backend/inja_ui_backend/store/policy.py ui-backend/tests/test_policy_store.py
git commit -m "feat(backend): the visibility policy, stated once

Six switches with D17's defaults in Python and only *changes* in the table, so
the defaults are written down exactly once. Defaults match what the export
publishes today: nothing becomes visible at migration that is not visible now.

set_field returns the value it replaced, because D19 wants both values and the
old one exists nowhere else a moment later.

version() is a digest of the policy rather than a counter of changes: it says
which policy an artifact was built under, so flipping a switch back must return
the old key rather than force a re-render for a change nobody can see."
```

---

### Task 5: The one filter

**Files:**
- Create: `ui-backend/inja_ui_backend/visibility.py`, `ui-backend/tests/test_visibility.py`

**Interfaces:**
- Consumes: `store.policy.FIELDS`/`DEFAULTS` (as a plain `dict[str, bool]` argument — this module never touches a database).
- Produces:
  - `PUBLIC_PROCESS_KEYS: tuple[str, ...]` — the exact top-level key set a non-editor's copy carries.
  - `links_only(doc: dict, sees: Callable[[object], bool]) -> dict`
  - `filtered(doc: dict, *, policy: dict[str, bool], sees: Callable[[object], bool], editor: bool) -> dict`
  - `public_overview(doc: dict, *, editor: bool) -> dict`
- Consumed by: Task 6 (`disclosure.Disclosure.redact`), Task 10 (`exports.build_payload`).

**The shape contract, decided here once.** A field the client dereferences is **blanked**; a field nothing reads is **dropped**.

| Field | Non-editor | Why |
|---|---|---|
| `id`, `department`, `name`, `parent`, `edges`, `nodes` | kept | always visible (D17) |
| `summary` → `""`, `idef0` → empty ICOM, `kpis` → `[]` | blanked when the switch is off | `Summary.tsx` dereferences `proc.idef0.controls` and `proc.kpis.map` with no guard |
| node `description` → `""`, `actor` → `""`, `icom` → empty ICOM | blanked when the switch is off | `flow/DetailDrawer.tsx` dereferences all three; `src/flow/**` is off-limits |
| node `source` → `{"created_by": "", "touched_by": []}` | always blanked | never shown (D17); the drawer renders `a.source.created_by` with no guard |
| `pending` → `[]` | always blanked | never shown (D17); `flow/adapt.ts` iterates it with no guard |
| `source`, `created_at`, `updated_at` | **dropped** | never shown (D17); nothing under `ui/src/` reads the process-level three, and `source.type` is an enum with no honest blank |
| `tombstoned`, `superseded_by` | **dropped** | excluded entirely (D17). A tombstone never reaches a non-editor as a whole record either (Task 7); this is the belt to that braces |

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_visibility.py`:

```python
"""The one filter (spec §11 test 8, D17, D18, D55, D56).

Every field the policy can hide is asserted in **both** directions against the
**same populated document**: hidden by default, and shown to an editor. A test
that asserts a field is absent proves nothing unless the field was there to
begin with, and a test that asserts an editor still sees it proves nothing
unless it is the same document.
"""
import copy

import pytest

from inja_ui_backend import visibility
from inja_ui_backend.store import policy

#: Every switchable field carries a distinct ASCII sentinel, so a failure names
#: what leaked at a glance and none of them can be a substring of anything else.
SENTINELS = {
    "process_summary": "SUMMARYTEXT",
    "process_idef0": "IDEF0TEXT",
    "process_kpis": "KPITEXT",
    "node_description": "DESCTEXT",
    "node_actor": "ACTORTEXT",
    "node_icom": "ICOMTEXT",
}


def _doc() -> dict:
    """A process with every policed field genuinely populated.

    Every one of the six switches, every never-shown field, and a node whose
    `subprocess` points out of the department. A document with an empty
    `idef0` or no `pending` cannot tell a working filter from an absent one.
    """
    return {
        "id": "dining-001", "department": "dining", "name": "پذیرایی",
        "summary": SENTINELS["process_summary"],
        "source": {"type": "voice", "ref": "meetings/SOURCEREF.m4a",
                   "run": "runs/chat/SOURCERUN"},
        "parent": {"process": "cooking-777", "node": "cooking-777-n010"},
        "created_at": "2026-07-06T10:00:00Z", "updated_at": "2026-07-06T10:00:00Z",
        "idef0": {"inputs": [SENTINELS["process_idef0"]], "controls": [],
                  "outputs": [], "mechanisms": []},
        "kpis": [{"name": SENTINELS["process_kpis"], "target": "۵"}],
        "nodes": [
            {"id": "dining-001-n010", "type": "activity", "label": "خوش‌آمدگویی",
             "description": SENTINELS["node_description"],
             "actor": SENTINELS["node_actor"],
             "icom": {"inputs": [SENTINELS["node_icom"]], "controls": [],
                      "outputs": [], "mechanisms": []},
             "subprocess": "cooking-888",
             "position": {"x": 160, "y": 90}, "layout": "auto",
             "source": {"created_by": "runs/NODESOURCE", "touched_by": ["ui-edit"]}},
            {"id": "dining-001-n020", "type": "activity", "label": "تسویه",
             "description": "شرح", "actor": "صندوق-دار",
             "icom": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
             "subprocess": "dining-002",
             "position": {"x": 300, "y": 90}, "layout": "auto",
             "source": {"created_by": "runs/x", "touched_by": []}},
        ],
        "edges": [{"from": "dining-001-n010", "to": "dining-001-n020", "label": "بعد"}],
        "pending": [{"node": "dining-001-n010", "field": "actor",
                     "current": SENTINELS["node_actor"], "proposed": "PENDINGVALUE",
                     "source": "runs/PENDINGRUN", "status": "open"}],
    }


def _sees_dining(ref) -> bool:
    """The link predicate for a caller who may view `dining` and nothing else."""
    return isinstance(ref, str) and ref.rsplit("-", 1)[0] == "dining"


def _text(doc) -> str:
    import json
    return json.dumps(doc, ensure_ascii=False)


def _default():
    return dict(policy.DEFAULTS)


# --- the riskiest first: a filter that stops filtering ---

@pytest.mark.parametrize("field", ["process_summary", "process_idef0",
                                   "process_kpis", "node_icom"])
def test_a_field_hidden_by_default_is_not_in_the_body(field):
    out = visibility.filtered(_doc(), policy=_default(), sees=_sees_dining,
                              editor=False)
    assert SENTINELS[field] not in _text(out), field


@pytest.mark.parametrize("field", ["node_description", "node_actor"])
def test_a_field_visible_by_default_is_in_the_body(field):
    """The other direction, and it is not decoration: a filter that blanked
    everything would satisfy every assertion above while taking the flowchart's
    words away from the people it is for."""
    out = visibility.filtered(_doc(), policy=_default(), sees=_sees_dining,
                              editor=False)
    assert SENTINELS[field] in _text(out), field


@pytest.mark.parametrize("field", list(SENTINELS))
def test_every_switch_moves_its_own_field_and_nobody_elses(field):
    """One switch, one field. The same document each way, so 'absent' and
    'present' are about the switch rather than about the fixture."""
    doc = _doc()
    off = visibility.filtered(doc, policy={**_default(), field: False},
                              sees=_sees_dining, editor=False)
    on = visibility.filtered(doc, policy={**_default(), field: True},
                             sees=_sees_dining, editor=False)
    assert SENTINELS[field] not in _text(off), f"{field} survived being switched off"
    assert SENTINELS[field] in _text(on), f"{field} did not appear when switched on"
    for other, token in SENTINELS.items():
        if other == field:
            continue
        assert (token in _text(off)) == (token in _text(on)), (
            f"switching {field} moved {other}")


@pytest.mark.parametrize("field", list(SENTINELS))
def test_an_editor_sees_every_field_whatever_the_policy_says(field):
    """The policy governs non-editors (D17's column is headed 'Non-editor
    default'). The same document, the strictest policy, `editor=True`."""
    doc = _doc()
    out = visibility.filtered(doc, policy={f: False for f in policy.FIELDS},
                              sees=_sees_dining, editor=True)
    assert SENTINELS[field] in _text(out), field


def test_the_never_shown_block_is_gone_for_a_non_editor():
    out = visibility.filtered(_doc(), policy=_default(), sees=_sees_dining,
                              editor=False)
    text = _text(out)
    for token in ("SOURCEREF", "SOURCERUN", "NODESOURCE", "ui-edit",
                  "PENDINGVALUE", "PENDINGRUN", "2026-07-06T10:00:00Z"):
        assert token not in text, token


def test_the_top_level_key_set_is_pinned_as_an_equality():
    """An equality, not a list of `not in`s: the interesting failure is a field
    nobody thought to name — one added to `process.schema.json` next month and
    copied straight into every reader's body. This fails on that too, and the fix
    is to decide, here, whether a reader may have it."""
    out = visibility.filtered(_doc(), policy=_default(), sees=_sees_dining,
                              editor=False)
    assert set(out) == {"id", "department", "name", "parent", "edges",
                        "summary", "idef0", "kpis", "nodes", "pending"}
    assert set(out) == set(visibility.PUBLIC_PROCESS_KEYS)


def test_a_hidden_field_is_blanked_and_never_dropped():
    """`ui/src/screens/Summary.tsx` dereferences `proc.idef0.controls` and
    `proc.kpis.map` with no guard, and `ui/src/flow/DetailDrawer.tsx` — which is
    off-limits to this plan — dereferences a node's `description`, `actor`,
    `icom` and `source`. Dropping any of them turns a reader's click into a
    TypeError inside a document already handed out; blanking cannot."""
    out = visibility.filtered(_doc(), policy={f: False for f in policy.FIELDS},
                              sees=_sees_dining, editor=False)
    assert out["summary"] == ""
    assert out["kpis"] == []
    assert out["idef0"] == {"inputs": [], "controls": [], "outputs": [],
                            "mechanisms": []}
    assert out["pending"] == []
    node = out["nodes"][0]
    assert node["description"] == "" and node["actor"] == ""
    assert node["icom"] == {"inputs": [], "controls": [], "outputs": [],
                            "mechanisms": []}
    assert node["source"] == {"created_by": "", "touched_by": []}


def test_a_nodes_geometry_and_identity_always_survive():
    """What the filter must never take: the diagram itself."""
    out = visibility.filtered(_doc(), policy={f: False for f in policy.FIELDS},
                              sees=_sees_dining, editor=False)
    node = out["nodes"][0]
    assert node["id"] == "dining-001-n010"
    assert node["type"] == "activity"
    assert node["label"] == "خوش‌آمدگویی"
    assert node["position"] == {"x": 160, "y": 90}
    assert node["layout"] == "auto"
    assert out["edges"] == [{"from": "dining-001-n010", "to": "dining-001-n020",
                             "label": "بعد"}]


def test_a_cross_department_link_is_withheld_and_a_local_one_is_kept():
    """Both directions, because a filter that blanked *every* link would pass the
    first assertion while quietly taking the sub-process graph away from the
    people it is for. What is under test is the department an id names, never the
    presence of a link."""
    for editor in (False, True):
        out = visibility.filtered(_doc(), policy=_default(), sees=_sees_dining,
                                  editor=editor)
        assert out["parent"] is None, editor
        assert out["nodes"][0]["subprocess"] is None, editor
        assert out["nodes"][1]["subprocess"] == "dining-002", editor


def test_the_link_rule_applies_to_an_editor_too():
    """An Editor of dining is not thereby an Editor of cooking. `editor` is the
    *field* stance and never the link stance — the two are separate questions and
    collapsing them is how a scope boundary leaks to the person most able to act
    on it."""
    out = visibility.filtered(_doc(), policy=_default(), sees=_sees_dining,
                              editor=True)
    assert "cooking-777" not in _text(out) and "cooking-888" not in _text(out)


def test_it_does_not_mutate_the_stored_document():
    """The stored document is what the writers and the export read; this shapes a
    copy on the way out."""
    doc = _doc()
    before = copy.deepcopy(doc)
    visibility.filtered(doc, policy=_default(), sees=_sees_dining, editor=False)
    visibility.filtered(doc, policy=_default(), sees=_sees_dining, editor=True)
    assert doc == before


def test_a_junction_or_terminal_node_survives_untouched():
    """`_public_node` must not invent `description`/`actor`/`icom` on a node type
    that has none — `process.schema.json` sets `additionalProperties: false`, so
    a filter that added them would produce a document the validator refuses."""
    doc = _doc()
    doc["nodes"].append({"id": "j1", "type": "junction", "junctionType": "XOR",
                         "direction": "split", "position": {"x": 9, "y": 9},
                         "layout": "auto"})
    out = visibility.filtered(doc, policy={f: False for f in policy.FIELDS},
                              sees=_sees_dining, editor=False)
    assert out["nodes"][-1] == {"id": "j1", "type": "junction",
                                "junctionType": "XOR", "direction": "split",
                                "position": {"x": 9, "y": 9}, "layout": "auto"}


def test_the_overview_is_shown_in_full_minus_its_timestamp():
    """D55 — no per-field switches and no policy table for the overview.
    `updated_at` goes because it is bookkeeping (D17), and nothing else does."""
    ov = {"department": "dining", "name": "سالن", "description": "شرح واحد",
          "sub_units": [{"name": "واحد یک", "description": "شرح"}],
          "personnel": [{"role": "میزبان", "duties": ["راهنمایی"],
                         "kpi": ["رضایت مهمان"]}],
          "updated_at": "2026-07-06T10:00:00Z"}
    out = visibility.public_overview(ov, editor=False)
    assert set(out) == {"department", "name", "description", "sub_units",
                        "personnel"}
    # Personnel KPIs are D55's, not D17's: they are shown, and the day they are
    # not, that is a new row in policy.FIELDS rather than a new mechanism here.
    assert out["personnel"][0]["kpi"] == ["رضایت مهمان"]
    assert visibility.public_overview(ov, editor=True) == ov


def test_the_overview_filter_does_not_mutate_its_argument():
    ov = {"department": "dining", "name": "سالن", "description": "",
          "sub_units": [], "personnel": [], "updated_at": "2026-07-06T10:00:00Z"}
    visibility.public_overview(ov, editor=False)
    assert "updated_at" in ov
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_visibility.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'inja_ui_backend.visibility'`.

- [ ] **Step 3: Write the module**

Create `ui-backend/inja_ui_backend/visibility.py`:

```python
"""What may be *inside* a body this service sends (spec D17, D18, D55, D56).

**One filter, applied server-side to every response.** Reports, the flow canvas,
the detail drawer and the department overview all read through it: one
implementation means one place to be wrong and one place tests can pin. The
strip happens in the payload, never in CSS — a reader with dev tools finds
nothing hidden.

Pure. No database, no filesystem, no caller. It takes the policy as a dict, the
"may I be told about this id?" question as a predicate, and one boolean saying
whether this view is an editor's; `disclosure.py` is what turns a request into
those three, and `exports.py` is what turns a department into them. Nothing here
mutates its argument: the stored document is what the writers and the export
read, and this shapes a copy on the way out.

**Two stances, and they are separate questions.**

* `sees` is about **scope**: a `parent` or a node's `subprocess` may name a
  process, a node and a department the caller is 404'd out of, and that is true
  of an Editor of one department as much as of a Reader. So the link rule runs
  for **both** stances.
* `editor` is about **capability at this document's department** — never about
  the caller in general. `dept:a` plus `dept:b/report:k` may edit a and not b,
  and "may this person edit somewhere?" is right for nobody.

**Blanked or dropped, and the rule for choosing.** A field the client
dereferences is blanked; a field nothing reads is dropped. `ui/src/flow/**` is
frozen and dereferences a node's `description`, `actor`, `icom` and
`source.created_by` with no guard, `flow/adapt.ts` iterates `pending`, and
`screens/Summary.tsx` indexes `idef0.controls` and maps `kpis` — dropping any of
those turns a reader's click into a TypeError inside a document that has already
been handed out. The process's own `source`/`created_at`/`updated_at` are read by
nothing under `ui/src/`, and `source.type` is an enum with no honest blank, so
they go.

**A node has no KPIs.** `$defs.activityNode` carries `id`, `type`, `label`,
`description`, `actor`, `icom`, `subprocess`, `position`, `layout`, `source` and
`removed` — nothing else. What a node carries is ICOM, which is IDEF0
information and not a performance indicator, so `node_icom` and `process_kpis`
are separate switches.
"""
from __future__ import annotations

from typing import Callable

#: The exact top-level key set a non-editor's copy of a process carries.
#:
#: A **whitelist**, not a blacklist, and pinned by an equality in the tests: a
#: field added to `process.schema.json` next month must have to be let in
#: deliberately rather than start shipping to every reader the day it is written.
PUBLIC_PROCESS_KEYS: tuple[str, ...] = (
    "id", "department", "name", "parent", "edges",
    "summary", "idef0", "kpis", "nodes", "pending",
)

#: Which switch governs which process key, and the blank it becomes when off.
_PROCESS_SWITCH: dict[str, tuple[str, Callable[[], object]]] = {}

#: The same for a node's three.
_NODE_SWITCH: dict[str, tuple[str, Callable[[], object]]] = {}


def _empty_icom() -> dict:
    """A fresh, structurally valid but empty ICOM record."""
    return {"inputs": [], "controls": [], "outputs": [], "mechanisms": []}


def _empty_node_source() -> dict:
    """A fresh, structurally valid but empty node provenance record."""
    return {"created_by": "", "touched_by": []}


_PROCESS_SWITCH.update({
    "summary": ("process_summary", str),
    "idef0": ("process_idef0", _empty_icom),
    "kpis": ("process_kpis", list),
})

_NODE_SWITCH.update({
    "description": ("node_description", str),
    "actor": ("node_actor", str),
    "icom": ("node_icom", _empty_icom),
})


def links_only(doc: dict, sees: Callable[[object], bool]) -> dict:
    """`doc` with every link this view may not be told about blanked.

    `parent` names another process **and one of its nodes**, so the whole record
    goes rather than only its `process`: the `node` half is a node id in that
    same department and is exactly as much of a disclosure. `None` is what the
    schema says an unparented process carries, so what the caller receives is a
    shape the client already handles rather than a hole in one.

    The department of a referenced id is read **lexically**, by the caller's
    `sees` predicate, and never by loading the referenced file: read it out of
    the stored document and the answer depends on whether that document is there,
    so a caller learns which of their guesses exist from which links survive.
    """
    out = dict(doc)
    parent = out.get("parent")
    if isinstance(parent, dict) and not sees(parent.get("process")):
        out["parent"] = None
    nodes = out.get("nodes")
    if isinstance(nodes, list):
        out["nodes"] = [
            {**n, "subprocess": None}
            if isinstance(n, dict) and n.get("subprocess") is not None
            and not sees(n.get("subprocess"))
            else n
            for n in nodes
        ]
    return out


def _public_node(node: dict, policy: dict[str, bool]) -> dict:
    """One node reduced to what a non-editor may read.

    `if key in out` and not an unconditional write: a junction or a terminal node
    carries none of these three, `process.schema.json` sets
    `additionalProperties: false`, and inventing an empty `actor` on a junction
    would produce a document the validator refuses.
    """
    out = dict(node)
    for key, (switch, blank) in _NODE_SWITCH.items():
        if key in out and not policy[switch]:
            out[key] = blank()
    if "source" in out:
        out["source"] = _empty_node_source()
    return out


def _public_process(doc: dict, policy: dict[str, bool]) -> dict:
    """One process reduced to what a non-editor may read."""
    out = {k: doc[k] for k in PUBLIC_PROCESS_KEYS if k in doc}
    for key, (switch, blank) in _PROCESS_SWITCH.items():
        if key in out and not policy[switch]:
            out[key] = blank()
    # `out["nodes"]`, not `doc["nodes"]` — `out` is already the link-filtered
    # copy, and reading the nodes back off the original here would put every
    # withheld `subprocess` straight back into the body.
    out["nodes"] = [_public_node(n, policy) if isinstance(n, dict) else n
                    for n in out.get("nodes", [])]
    # Emptied, not dropped: `ui/src/flow/adapt.ts` iterates `pending` to count
    # each node's conflicts with no guard, so the key has to be there; the
    # *contents* must not travel. D17 puts it in the never-shown block with no
    # switch, and D56 puts even its count in the derived-signals row.
    out["pending"] = []
    return out


def filtered(doc: dict, *, policy: dict[str, bool],
             sees: Callable[[object], bool], editor: bool) -> dict:
    """**The** filter. Every body carrying a process document comes through here.

    The link rule runs for both stances; the field rule runs for non-editors
    only, because D17's column is headed "Non-editor default" and an Editor is
    the person the hidden content is *for*.
    """
    out = links_only(doc, sees)
    return out if editor else _public_process(out, policy)


def public_overview(doc: dict, *, editor: bool) -> dict:
    """The department information page — shown **in full** (D55).

    No per-field switches, no policy table, and none planned. The overview is
    *about* a department rather than being the mechanics of a process, and every
    part of it — what the department does, its sub-units, who works there and
    what each role is measured on — is what a staff member should be able to
    read. Two gates still apply and neither is field visibility: scope, and
    confirmation (both `disclosure.py`'s).

    `updated_at` goes, like every other timestamp: bookkeeping, not content.

    If a reason to hide part of the overview ever appears — personnel KPIs being
    the likely candidate — it becomes a new row in `store.policy.FIELDS`, not a
    second mechanism here.
    """
    if editor:
        return doc
    return {k: v for k, v in doc.items() if k != "updated_at"}
```

- [ ] **Step 4: Run the tests**

Run: `.venv/bin/pytest ui-backend/tests/test_visibility.py -q`
Expected: PASS — 26 tests (the two `parametrize`d families expand to 4, 2, 6 and 6).

- [ ] **Step 5: Prove the filter is load-bearing, both ways**

Temporarily change `filtered` to `return links_only(doc, sees)` (i.e. never filter fields) and re-run: expected FAIL on `test_a_field_hidden_by_default_is_not_in_the_body`, `test_the_never_shown_block_is_gone_for_a_non_editor` and `test_the_top_level_key_set_is_pinned_as_an_equality`. Then change it to filter fields for editors too (`return _public_process(links_only(doc, sees), policy)`) and re-run: expected FAIL on `test_an_editor_sees_every_field_whatever_the_policy_says`. Revert. Report both.

- [ ] **Step 6: Commit**

```bash
git add ui-backend/inja_ui_backend/visibility.py ui-backend/tests/test_visibility.py
git commit -m "feat(backend): one filter, and one place to be wrong

D18 asks for a single filter over every response, driven by the policy plus the
caller. This is it, and it is pure: a document, a policy dict, a 'may I be told
of this id?' predicate and one boolean.

The link rule runs for BOTH stances and the field rule for non-editors only —
an Editor of dining is not thereby an Editor of cooking, and D17's column is
headed 'Non-editor default'.

A field the client dereferences is blanked; a field nothing reads is dropped.
src/flow/** is frozen and dereferences a node's description, actor, icom and
source.created_by unguarded, and Summary indexes idef0.controls — dropping any
of those is a TypeError inside a document already handed out.

The top-level key set is a whitelist pinned by an equality, so a field added to
the schema next month has to be let in deliberately."
```

---

### Task 6: Every response reads the one filter

**Files:**
- Modify: `ui-backend/inja_ui_backend/disclosure.py` (the class docstring, `__init__`, `redact`; add `redact_overview`)
- Modify: `ui-backend/inja_ui_backend/routers/departments.py:141-148` (`get_overview`)
- Modify: `ui-backend/tests/test_body_scan.py` (the corpus gains field sentinels; a new capability-checked token list)

**Interfaces:**
- Consumes: `visibility.filtered`, `visibility.public_overview`, `store.policy.current`.
- Produces: `Disclosure.redact(doc, dept) -> dict` (**unchanged signature** — the five process boundaries that already call it need no edit) and `Disclosure.redact_overview(doc, dept) -> dict`.

**The six process boundaries already call `Disclosure.redact`** — `GET /api/processes/{pid}`, `POST /api/processes`, `POST /api/processes/{pid}/relayout`, `PUT /api/processes/{pid}`, `POST /api/processes/{pid}/pending/{index}` and `GET /api/departments/{code}/processes`. Keeping the signature is what makes this task a two-file change rather than a six-file one, and what makes "every boundary runs the same rule" a property a reader can check.

**`restore` needs no change, and that is worth knowing before you look for a bug.** `restore` exists because a *blanked link* would otherwise be round-tripped onto disk by an Editor's Save. The field policy cannot create the same problem: it applies only when `editor=False`, and a caller who cannot `edit` that department cannot reach `PUT /api/processes/{pid}` at all. Do not add a field restore.

- [ ] **Step 1: Write the failing test**

In `ui-backend/tests/test_body_scan.py`, add the sentinels to the corpus and a new token list.

First, in `_process`, replace the `summary`, `idef0`, `kpis` and node lines so every policed field carries a token. Change the signature and body of `_process` to:

```python
def _process(pid: str, dept: str, *, name: str, label: str, actor: str,
             proposed: str, tag: str, parent: dict | None = None,
             subprocess: str | None = None) -> dict:
    """A process of the fixture's shape, with every string under this file's control.

    `tag` is this document's field-sentinel prefix: every field the visibility
    policy can hide carries `{tag}` plus the field's name, so a leak names both
    the document it came from and the switch that should have stopped it.

    Authored rather than copied from `tests/fixtures/process.cooking-001.json`:
    that document contains «انبار» and «حسابداری», which are two departments'
    display names, so a copy of it planted in `dining` would trip this file's own
    token list and read as a backend leak.
    """
    node = f"{pid}-n010"
    return {
        "id": pid, "department": dept, "name": name,
        "summary": f"{tag}SUMMARY",
        "source": {"type": "manual", "ref": None, "run": None},
        "parent": parent,
        "created_at": "2026-07-06T10:00:00Z", "updated_at": "2026-07-06T10:00:00Z",
        "idef0": {"inputs": [f"{tag}IDEF0"], "controls": [], "outputs": [],
                  "mechanisms": []},
        "kpis": [{"name": f"{tag}KPI"}],
        "nodes": [
            {"id": "start", "type": "start", "label": "شروع",
             "position": {"x": 30, "y": 100}, "layout": "auto"},
            {"id": node, "type": "activity", "label": label, "actor": actor,
             "description": f"{tag}DESC", "subprocess": subprocess,
             "icom": {"inputs": [f"{tag}ICOM"], "controls": [], "outputs": [],
                      "mechanisms": []},
             "position": {"x": 160, "y": 90}, "layout": "auto",
             "source": {"created_by": f"runs/{tag}SOURCE", "touched_by": []}},
            {"id": "end", "type": "end", "label": "پایان",
             "position": {"x": 320, "y": 100}, "layout": "auto"},
        ],
        "edges": [{"from": "start", "to": node, "label": ""},
                  {"from": node, "to": "end", "label": ""}],
        "pending": [{"node": node, "field": "actor", "current": actor,
                     "proposed": proposed, "source": f"runs/{proposed}",
                     "status": "open"}],
    }
```

Every existing call gains a `tag=`. Update the five call sites:

```python
# in `_tombstone`
    doc = _process(pid, dept, name="TOMBNAME", label="TOMBLABEL",
                   actor="TOMBACTOR", proposed="TOMBPROPOSED", tag="TOMB")

# in `corpus`
    _write(data_root, MINE, "processes/dining-001.json",
           _process("dining-001", MINE, name="پذیرایی از مهمان",
                    label="خوش‌آمدگویی", actor="میزبان", proposed="MINEPROPOSED",
                    tag="MINEA",
                    parent={"process": FOREIGN_PARENT, "node": FOREIGN_PARENT_NODE},
                    subprocess=FOREIGN_CHILD))
    _write(data_root, MINE, "processes/dining-002.json",
           _process("dining-002", MINE, name="ترخیص میز",
                    label="تسویه", actor="میزبان", proposed="پیشخدمت",
                    tag="MINEB", subprocess=LOCAL_CHILD))
    _write(data_root, THEIRS, "processes/cooking-777.json",
           _process("cooking-777", THEIRS, name="LEAKNAME", label="LEAKLABEL",
                    actor="LEAKACTOR", proposed="LEAKPROPOSED", tag="LEAKF"))
    _write(data_root, "logistics", "processes/logistics-005.json",
           _process("logistics-005", "logistics", name="بارگیری",
                    label="تحویل", actor="راننده", proposed="پیک", tag="LOGF"))

# in `_a_saved_document`
    return _process(f"{d}-001", d, name="پذیرایی از مهمان", label="خوش‌آمدگویی",
                    actor="میزبان", proposed="MINEPROPOSED", tag="MINEA")
```

Then add the new token list beside `TOMBSTONE_TOKENS` and `PENDING_TOKENS`:

```python
#: The fields D17 hides from a non-editor by default, planted inside the
#: caller's own department.
#:
#: Checked against **capability**, exactly like `TOMBSTONE_TOKENS`, and never
#: added to `FORBIDDEN`: an Editor of dining sees all of these legitimately, so
#: `test_no_role_is_served_anything_outside_its_scope_anywhere_in_any_body`
#: would fail for the `editor` parameter over content that role is entitled to.
#:
#: `MINEA` is `dining-001` and `MINEB` is `dining-002`, so a leak names the
#: document as well as the switch.
HIDDEN_FIELD_TOKENS: tuple[tuple[str, str], ...] = (
    ("MINEASUMMARY", "the process summary of dining-001 (D17: hidden by default)"),
    ("MINEAIDEF0", "the process IDEF0 record of dining-001 (D17: hidden)"),
    ("MINEAKPI", "a process KPI of dining-001 (D17: hidden)"),
    ("MINEAICOM", "a node's ICOM on dining-001 (D17: hidden)"),
    ("MINEASOURCE", "a node's provenance on dining-001 (D17: never shown)"),
    ("MINEBSUMMARY", "the process summary of dining-002"),
)

#: The two D17 shows by default, planted in the same documents.
#:
#: The other direction, and it is the half that stops the filter from becoming
#: 'blank everything': a filter that took these away would satisfy every
#: assertion above while emptying the flowchart for the people it is for.
SHOWN_FIELD_TOKENS: tuple[tuple[str, str], ...] = (
    ("MINEADESC", "a node's description on dining-001 (D17: visible by default)"),
    ("MINEBDESC", "a node's description on dining-002"),
)
```

Now the two paired tests. Add them at the end of the file:

```python
def _reader_bodies(client) -> str:
    """Every read body this caller can obtain, serialised into one string."""
    import json as _json
    out = []
    for route in [_fill(r, u=client.username) for r in GLOBAL_READS] + \
                 [_fill(r, d=MINE, u=client.username) for r in DEPT_READS]:
        r = client.request(route.method, route.path, json=route.body)
        try:
            out.append(_json.dumps(r.json(), ensure_ascii=False))
        except ValueError:
            out.append(r.text)
    return "\n".join(out)


@pytest.mark.parametrize("role", ["reader", "reader_no_download", "admin"])
def test_no_hidden_field_reaches_a_caller_who_cannot_edit_the_department(
        corpus, tmp_path, role):
    """§11 test 8 — no denylisted field in any response to a non-editor.

    All three non-editing roles, because an Admin holds `manage_users` and
    `view_audit` and still holds no `edit`: the policy is about the capability at
    this department, never about how senior the account is.
    """
    client = _client_as(corpus, tmp_path, role, f"dept:{MINE}")
    body = _reader_bodies(client)
    leaked = [f"{token} ({why})" for token, why in HIDDEN_FIELD_TOKENS
              if token in body]
    assert leaked == [], f"as a {role}: " + "; ".join(leaked)


def test_an_editor_of_the_department_is_served_every_one_of_those_fields(
        corpus, tmp_path):
    """The pairing, over the **same corpus**.

    Without it the test above passes against a backend that serves a scoped
    Editor nothing at all — and against one that has quietly stopped planting the
    tokens. Both halves read the same documents; only the caller differs.
    """
    client = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    body = _reader_bodies(client)
    missing = [f"{token} ({why})" for token, why in HIDDEN_FIELD_TOKENS
               if token not in body]
    assert missing == [], (
        "an Editor of their own department was not served: " + "; ".join(missing)
        + " — either the filter is stripping for editors too, or the corpus"
          " stopped planting these")


@pytest.mark.parametrize("role", ["reader", "reader_no_download", "admin", "editor"])
def test_the_two_fields_d17_shows_by_default_reach_everyone(corpus, tmp_path, role):
    """A filter that blanked everything would pass every assertion above."""
    client = _client_as(corpus, tmp_path, role, f"dept:{MINE}")
    body = _reader_bodies(client)
    missing = [f"{token} ({why})" for token, why in SHOWN_FIELD_TOKENS
               if token not in body]
    assert missing == [], f"as a {role}, nothing carried: " + "; ".join(missing)


def test_the_overview_reaches_a_reader_in_full_except_its_timestamp(corpus, tmp_path):
    """D55 — the department information page is shown in its entirety.

    Asserted as an equality against the Editor's own body minus one key, so
    "in full" cannot quietly become "in part": a future switch on personnel KPIs
    would fail here and have to be a decision.
    """
    reader = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}")
    editor = _client_as(corpus, tmp_path, "editor", f"dept:{MINE}")
    theirs = editor.get(f"/api/departments/{MINE}/overview").json()
    mine = reader.get(f"/api/departments/{MINE}/overview").json()
    assert set(theirs) - set(mine) == {"updated_at"}
    assert mine == {k: v for k, v in theirs.items() if k != "updated_at"}
    # …and the thing D55 names as the likely future candidate is present today.
    assert mine["personnel"][0]["kpi"] == ["رضایت مهمان"]
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_body_scan.py -q`
Expected: FAIL — `test_no_hidden_field_reaches_a_caller_who_cannot_edit_the_department` reports every `HIDDEN_FIELD_TOKENS` entry for all three roles, and `test_the_overview_reaches_a_reader_in_full_except_its_timestamp` fails with `set() == {"updated_at"}` because the overview is served raw.

- [ ] **Step 3: Make `Disclosure` delegate to the one filter**

In `ui-backend/inja_ui_backend/disclosure.py`, replace the imports and the `__init__`/`redact` pair. The imports become:

```python
from . import storage, visibility
from .access import permits
from .store import policy
```

`__init__` gains one line:

```python
    def __init__(self, conn: sqlite3.Connection, user: sqlite3.Row) -> None:
        self._may_view = permits(conn, user, "view")
        self._may_edit = permits(conn, user, "edit")
        # One read of the policy per request, for the same reason `permits`
        # hoists its two lookups: a listing runs the filter over every process
        # in a department, and the policy cannot change inside one request.
        self._policy = policy.current(conn)
```

and `redact` becomes a delegation:

```python
    def redact(self, doc: dict, dept: str) -> dict:
        """`doc` as this caller may receive it. `dept` is the document's own.

        `dept` is passed in rather than read from `doc["id"]` or
        `doc["department"]`, and that is deliberate: the routers derive it from
        the request path, so it is the very string the gate ran on. A
        hand-edited file whose `id` disagrees with its location would otherwise
        be redacted against a department nobody was gated on.

        The shaping itself is `visibility.filtered` and nothing here — D18 wants
        one filter over every response, and a second copy of the rule in this
        module is how the API and the published bundle would come to disagree
        about what a reader may have.
        """
        return visibility.filtered(doc, policy=self._policy, sees=self.sees,
                                   editor=self.edits(dept))

    def redact_overview(self, doc: dict, dept: str) -> dict:
        """The department information page as this caller may receive it (D55).

        Shown in full, minus `updated_at`. It carries no ids, so there is no link
        rule to run and `sees` never enters — which is exactly why it is a
        separate two-line method rather than a flag on `redact`: a shared entry
        point would have to decide, per call, which of the two shapes it was
        looking at, from a dict that says nothing about which it is.
        """
        return visibility.public_overview(doc, editor=self.edits(dept))
```

Also update the module docstring's opening: after the sentence *"Two rules, one module, because they are the same rule at the same boundaries"*, add a paragraph:

```
**Three rules now.** The third is D17's field policy, and it is not written here
either: `visibility.py` holds the shape and this module holds the *caller* —
which department they may edit, and which ids they may be told about. Everything
that decides what a body contains lives in exactly one function, and this is the
only module that resolves a request into its arguments.
```

- [ ] **Step 4: Make the overview endpoint use it**

In `ui-backend/inja_ui_backend/routers/departments.py`, replace `get_overview` (currently lines 141–148):

```python
@router.get("/{code}/overview")
def get_overview(code: str, request: Request,
                 user=Depends(requires("view", _dept_target))):
    """The department information page — in full, minus its timestamp (D55).

    Shown in its entirety: no per-field switches, no policy table, and none
    planned. What the department does, its sub-units, who works there and what
    each role is measured on is what a staff member should be able to read.
    `updated_at` goes because it is bookkeeping (D17), like every other
    timestamp.

    Redacted rather than returned raw, so that "every boundary runs the same
    rule" stays a property a reader can check rather than a list of the ones
    somebody remembered.
    """
    cfg = request.app.state.cfg
    path = storage.overview_path(cfg.data_root, code)
    if not path.is_file():
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    shown = Disclosure(request.app.state.db, user)
    return shown.redact_overview(storage.read_json(path), code)
```

- [ ] **Step 5: Run the body scan, then everything**

Run: `.venv/bin/pytest ui-backend/tests/test_body_scan.py -q`
Expected: PASS.

Run: `.venv/bin/pytest ui-backend/tests -q`
Expected: PASS. `test_departments.py`'s overview test signs in as the seeded Editor with scope `*`, so it still receives `updated_at`; if any test fails because a **reader** expected `updated_at`, the test is wrong and D55 is right.

- [ ] **Step 6: Prove the pairing is not vacuous**

Temporarily make `redact` pass `editor=True` unconditionally and re-run `test_body_scan.py`. Expected: `test_no_hidden_field_reaches_a_caller_who_cannot_edit_the_department` fails for all three roles. Then make it pass `editor=False` unconditionally and re-run: expected `test_an_editor_of_the_department_is_served_every_one_of_those_fields` fails. Revert. Report both — a per-caller regression ("may this person edit somewhere?") passed the entire suite once already in this project, and these two tests are what would catch its successor.

- [ ] **Step 7: Commit**

```bash
git add ui-backend/inja_ui_backend/disclosure.py ui-backend/inja_ui_backend/routers/departments.py ui-backend/tests/test_body_scan.py
git commit -m "feat(backend): every body comes through the one filter

Disclosure keeps its two resolutions and delegates the shaping to
visibility.filtered. The signature is unchanged, so the six process boundaries
that already call redact() need no edit — which is what makes 'every boundary
runs the same rule' checkable rather than a list of the ones we remembered.

The department overview joins them: shown in full (D55) minus updated_at, and
pinned as an equality against an Editor's own body so 'in full' cannot quietly
become 'in part'.

The body scan now plants a sentinel in every policed field and asserts both
directions over the same corpus: hidden from three non-editing roles, served to
an Editor of that department. Neither half means anything alone."
```

---

### Task 7: Unconfirmed and tombstoned records, withheld in the query

**Files:**
- Modify: `ui-backend/inja_ui_backend/disclosure.py` (add `may_serve`, `servable`)
- Modify: `ui-backend/inja_ui_backend/routers/processes.py:147-182` (`get_process`)
- Modify: `ui-backend/inja_ui_backend/routers/departments.py` (`list_departments`, `get_overview`, `list_processes`)
- Modify: `ui-backend/inja_ui_backend/routers/pending.py`
- Modify: `ui-backend/tests/test_body_scan.py` (`_client_as` confirms the corpus)
- Create: `ui-backend/tests/test_confirmation_gate.py`

**Interfaces:**
- Consumes: `fingerprint.fingerprint`, `store.confirmations.get`/`stored_for`.
- Produces:
  - `Disclosure.may_serve(doc: dict, dept: str, target: str) -> bool`
  - `Disclosure.servable(docs: list[dict], dept: str) -> list[dict]`

**This task closes the fourth handed-down debt** — `/api/pending` not skipping tombstones — in the same commit as the record gate, because it is the same clause: a record D17 excludes entirely is absent from every body, and "edit-gated so not a breach" was a reason to defer it, not a reason it is right.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_confirmation_gate.py`:

```python
"""Unconfirmed content is invisible to non-editors (spec D22, D23, D56).

Filtered in the query and never client-side: the record is absent from the
body, and a single process is a 404 — not a 403, which would teach the caller
that a document they may not have exists (D56's Existence row).
"""
import itertools
import json
import time

import pytest
from fastapi.testclient import TestClient

from inja_ui_backend import db, seed
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.fingerprint import fingerprint
from inja_ui_backend.store import confirmations, users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
BASE = "https://testserver"
_seq = itertools.count()


def _proc(pid: str, dept: str, name: str) -> dict:
    return {
        "id": pid, "department": dept, "name": name, "summary": "خلاصه",
        "source": {"type": "manual", "ref": None, "run": None}, "parent": None,
        "created_at": "2026-07-06T10:00:00Z", "updated_at": "2026-07-06T10:00:00Z",
        "idef0": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
        "kpis": [],
        "nodes": [{"id": f"{pid}-n010", "type": "activity", "label": "کار",
                   "description": "", "actor": "", "subprocess": None,
                   "icom": {"inputs": [], "controls": [], "outputs": [],
                            "mechanisms": []},
                   "position": {"x": 60, "y": 60}, "layout": "auto",
                   "source": {"created_by": "ui", "touched_by": []}}],
        "edges": [], "pending": [],
    }


def _overview(dept: str) -> dict:
    return {"department": dept, "name": "سالن", "description": "شرح",
            "sub_units": [], "personnel": [],
            "updated_at": "2026-07-06T10:00:00Z"}


@pytest.fixture
def corpus(data_root):
    """Two dining processes and a dining overview — none of them confirmed."""
    base = data_root / "departments" / "dining"
    (base / "processes" / "dining-001.json").write_text(
        json.dumps(_proc("dining-001", "dining", "پذیرایی"), ensure_ascii=False),
        encoding="utf-8")
    (base / "processes" / "dining-002.json").write_text(
        json.dumps(_proc("dining-002", "dining", "ترخیص"), ensure_ascii=False),
        encoding="utf-8")
    (base / "overview.json").write_text(
        json.dumps(_overview("dining"), ensure_ascii=False), encoding="utf-8")
    return data_root


def _client_as(data_root, tmp_path, role, *scopes):
    n = next(_seq)
    username = f"0913{n:07d}"
    cfg = cfg_for(data_root, tmp_path / f"gate-{n}.db")
    conn = db.connect(cfg.app_db)
    try:
        db.migrate(conn)
        seed.seed(conn, editor_username="09190000000", editor_display_name="e",
                  editor_password_hash=hash_password(PW))
        rid = conn.execute("SELECT id FROM roles WHERE name = ?", (role,)).fetchone()[0]
        uid = users.create(conn, username=username, display_name="u",
                           password_hash=hash_password(PW), role_id=rid)
        for s in scopes:
            conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)",
                         (uid, s))
    finally:
        conn.close()
    client = TestClient(create_app(cfg), base_url=BASE)
    assert client.post("/api/auth/login",
                       json={"username": username, "password": PW}).status_code == 200
    client.app_db = cfg.app_db
    client.data_root = data_root
    return client


def _confirm(client, target: str, path: str) -> None:
    """Vouch for the document at `path` directly in the store.

    Directly, not through the endpoint, because the endpoint is Task 8's and this
    file is about what the *gate* does with a confirmation that exists.
    """
    doc = json.loads((client.data_root / path).read_text(encoding="utf-8"))
    conn = db.connect(client.app_db)
    try:
        confirmations.set_confirmation(conn, target=target,
                                       fingerprint=fingerprint(doc),
                                       by="09190000000", at=int(time.time()))
    finally:
        conn.close()


P1 = "departments/dining/processes/dining-001.json"
OV = "departments/dining/overview.json"


# --- D23: the system starts dark ---

def test_a_reader_sees_an_empty_department_until_something_is_confirmed(corpus,
                                                                        tmp_path):
    """D23 — all 85 existing processes start unconfirmed, so a non-editor sees an
    empty system until an Editor reviews each one."""
    client = _client_as(corpus, tmp_path, "reader", "dept:dining")
    assert client.get("/api/departments/dining/processes").json() == []
    assert client.get("/api/processes/dining-001").status_code == 404
    assert client.get("/api/departments/dining/overview").status_code == 404


def test_an_editor_sees_the_unconfirmed_department_in_full(corpus, tmp_path):
    """The pairing. Without it, every assertion above holds against a backend
    that serves nobody anything — the failure this whole file would otherwise
    have no way to notice."""
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    assert len(client.get("/api/departments/dining/processes").json()) == 2
    assert client.get("/api/processes/dining-001").status_code == 200
    assert client.get("/api/departments/dining/overview").status_code == 200


# --- confirming makes it appear, and only it ---

def test_confirming_one_process_shows_that_one_and_no_other(corpus, tmp_path):
    client = _client_as(corpus, tmp_path, "reader", "dept:dining")
    _confirm(client, "dining-001", P1)
    listed = client.get("/api/departments/dining/processes").json()
    assert [p["id"] for p in listed] == ["dining-001"]
    assert client.get("/api/processes/dining-001").status_code == 200
    # dining-002 is still unconfirmed, and its id must not appear anywhere.
    assert client.get("/api/processes/dining-002").status_code == 404
    assert "dining-002" not in json.dumps(listed, ensure_ascii=False)


def test_confirming_the_overview_is_a_separate_decision(corpus, tmp_path):
    """D20/D55 — the target is a process id **or** a department code, and one
    does not imply the other."""
    client = _client_as(corpus, tmp_path, "reader", "dept:dining")
    _confirm(client, "dining-001", P1)
    assert client.get("/api/departments/dining/overview").status_code == 404
    _confirm(client, "dining", OV)
    assert client.get("/api/departments/dining/overview").status_code == 200


# --- the mark is a fingerprint, so it self-invalidates ---

def test_editing_a_confirmed_process_hides_it_again(corpus, tmp_path):
    """The whole reason the mark is a fingerprint and not a boolean (D20).

    Nothing clears anything here: the file changes and the stored fingerprint
    stops matching. A boolean would need the UI's Save, a chat edit and a `merge`
    run each to remember, and missing one leaves the mark vouching for something
    stale.
    """
    client = _client_as(corpus, tmp_path, "reader", "dept:dining")
    _confirm(client, "dining-001", P1)
    assert client.get("/api/processes/dining-001").status_code == 200

    path = corpus / P1
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["nodes"][0]["position"] = {"x": 61, "y": 60}     # a re-layout, D21
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    assert client.get("/api/processes/dining-001").status_code == 404
    assert client.get("/api/departments/dining/processes").json() == []


def test_a_pipeline_run_touching_provenance_leaves_it_visible(corpus, tmp_path):
    """The other side of D21's exclusions, end to end: ARD §5.3 writes
    `source.touched_by` for processes a run decided were unchanged, and if that
    un-confirmed them a voice run would empty every department head's screen."""
    client = _client_as(corpus, tmp_path, "reader", "dept:dining")
    _confirm(client, "dining-001", P1)
    path = corpus / P1
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["source"]["run"] = "runs/chat/20260811-090000"
    doc["updated_at"] = "2026-08-11T09:00:00Z"
    doc["nodes"][0]["source"]["touched_by"] = ["merge"]
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    assert client.get("/api/processes/dining-001").status_code == 200


# --- the refusal reveals nothing ---

def test_an_unconfirmed_process_is_404_and_not_403(corpus, tmp_path):
    """D56's Existence row. A 403 would let a reader enumerate which ids are
    processes an Editor has not got round to yet — and the body must be the one
    uniform 404 too, or the words say what the number stopped saying."""
    from inja_ui_backend.access import NOT_FOUND
    client = _client_as(corpus, tmp_path, "reader", "dept:dining")
    r = client.get("/api/processes/dining-001")
    assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND})


# --- the derived signals go with the records ---

def test_the_board_counts_only_what_the_caller_can_open(corpus, tmp_path):
    """D56's derived-signals row. A count of three beside a list of one answers
    'how much is being withheld from you', which is the question the filter
    exists to refuse."""
    client = _client_as(corpus, tmp_path, "reader", "dept:dining")
    row = next(d for d in client.get("/api/departments").json()
               if d["code"] == "dining")
    assert row["count"] == 0
    _confirm(client, "dining-001", P1)
    row = next(d for d in client.get("/api/departments").json()
               if d["code"] == "dining")
    assert row["count"] == 1
    assert len(client.get("/api/departments/dining/processes").json()) == 1


def test_an_editors_board_still_counts_the_unconfirmed(corpus, tmp_path):
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    row = next(d for d in client.get("/api/departments").json()
               if d["code"] == "dining")
    assert row["count"] == 2


# --- the fourth handed-down debt ---

def test_pending_skips_a_tombstoned_process(corpus, tmp_path):
    """A tombstone's unresolved proposals are proposals about a record D17
    excludes entirely. Edit-gated, so this was never a disclosure — it was an
    Editor being asked to resolve a conflict on a document nobody will read.
    """
    doc = _proc("dining-003", "dining", "باطل")
    doc["tombstoned"] = True
    doc["superseded_by"] = []
    doc["pending"] = [{"node": "dining-003-n010", "field": "actor",
                       "current": "الف", "proposed": "TOMBPROPOSAL",
                       "source": "runs/x", "status": "open"}]
    (corpus / "departments/dining/processes/dining-003.json").write_text(
        json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    live = _proc("dining-004", "dining", "زنده")
    live["pending"] = [{"node": "dining-004-n010", "field": "actor",
                        "current": "ب", "proposed": "LIVEPROPOSAL",
                        "source": "runs/x", "status": "open"}]
    (corpus / "departments/dining/processes/dining-004.json").write_text(
        json.dumps(live, ensure_ascii=False), encoding="utf-8")

    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    body = client.get("/api/pending").json()
    # The live one is present, which is what stops "the tombstone is gone" from
    # meaning "the endpoint returns nothing".
    assert [p["proposed"] for p in body] == ["LIVEPROPOSAL"]
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_confirmation_gate.py -q`
Expected: FAIL — `test_a_reader_sees_an_empty_department_until_something_is_confirmed` gets a two-element list and two 200s, and `test_pending_skips_a_tombstoned_process` sees `["TOMBPROPOSAL", "LIVEPROPOSAL"]`.

- [ ] **Step 3: Give `Disclosure` the record gate**

Append to `ui-backend/inja_ui_backend/disclosure.py` (inside the class, after `edits`), and add `from .fingerprint import fingerprint` plus `from .store import confirmations, policy` to the imports, and `self._conn = conn` to `__init__`:

```python
    def may_serve(self, doc: dict, dept: str, target: str) -> bool:
        """May this caller be told that this **record** exists at all?

        Two clauses, one question (D17, D22, D56):

        * a tombstoned process is *excluded entirely*, with no switch;
        * a process or overview carrying no valid confirmation does not appear
          for any user without `edit` on its department.

        An Editor is exempt from both, and for the same reason: they are the
        person a tombstone is retained for and the person who has to read an
        unconfirmed document in order to confirm it.

        `target` is passed in rather than read out of `doc` — a process id or a
        department code — so the string the confirmation is looked up under is
        the string the route was gated on, exactly as `dept` is in `redact`.

        The comparison is `stored == fingerprint(doc)` and never `stored is not
        None`: a mark that no longer matches its document is not a weaker mark,
        it is a mark for a document that no longer exists.
        """
        if self.edits(dept):
            return True
        if doc.get("tombstoned"):
            return False
        row = confirmations.get(self._conn, target)
        return row is not None and row["fingerprint"] == fingerprint(doc)

    def servable(self, docs: list[dict], dept: str) -> list[dict]:
        """`docs` reduced to the records this caller may be told exist.

        The batch form of `may_serve`, and the reason it exists is D56's
        *"filtered in the query. Never client-side"*: one statement resolves the
        whole department rather than one per document inside a loop.

        An editor gets the list back untouched — tombstones included, because the
        process list draws them greyed and carries the only permanent-delete
        affordance there is.

        Fingerprinting every document in a department costs a SHA-256 over each
        file's canonical form; the largest department is 38 processes, which is
        under a millisecond of hashing beside the reads that produced the
        documents in the first place.
        """
        if self.edits(dept):
            return list(docs)
        ids = [d["id"] for d in docs if isinstance(d.get("id"), str)]
        stored = confirmations.stored_for(self._conn, ids)
        return [d for d in docs
                if not d.get("tombstoned")
                and stored.get(d.get("id")) == fingerprint(d)]
```

- [ ] **Step 4: Apply the gate at the four reading boundaries**

**`routers/processes.py`** — in `get_process`, replace the tombstone check:

```python
    _, doc = _load(request.app.state.cfg, pid)
    shown = Disclosure(request.app.state.db, user)
    dept = storage.dept_of(pid)
    # Tombstoned (D17) or carrying no valid confirmation (D22) — one question,
    # and 404 for both: for a non-editor these are not resources they may not act
    # on, they are resources they must not learn exist. A 403 here would let a
    # reader enumerate which ids are processes nobody has confirmed yet.
    if not shown.may_serve(doc, dept, pid):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return shown.redact(doc, dept)
```

and extend that handler's docstring: after the paragraph beginning *"One process — and **not** a tombstoned one"*, add

```
    **Nor an unconfirmed one** (D22). A process carrying no valid confirmation
    does not appear for any user without `edit`, and the same 404 answers it: the
    two are one clause, because "this record is not for you" must have one answer
    however it came to be true.
```

**`routers/departments.py`** — `list_processes`'s filter becomes the gate:

```python
    cfg = request.app.state.cfg
    shown = Disclosure(request.app.state.db, user)
    docs = shown.servable(storage.ordered_processes(cfg.data_root, code), code)
    return [shown.redact(d, code) for d in docs]
```

**`routers/departments.py`** — `get_overview` gains the same gate, immediately before the return added in Task 6:

```python
    shown = Disclosure(request.app.state.db, user)
    doc = storage.read_json(path)
    # D22 applies to the overview exactly as to a flowchart: an overview with no
    # valid confirmation is invisible to every non-editor, and the target is the
    # department code (D20).
    if not shown.may_serve(doc, code, code):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return shown.redact_overview(doc, code)
```

**`routers/departments.py`** — `list_departments`'s counting loop becomes:

```python
    for d in reg["departments"]:
        if reachable is not None and d["code"] not in reachable:
            continue
        docs = [storage.read_json(p)
                for p in storage.list_process_files(cfg.data_root, d["code"])]
        # Counted before the record gate, and only over the active set, exactly
        # as before: this number is served only to someone who may `edit` here.
        conflicts = sum(1 for doc in docs if not doc.get("tombstoned")
                        for p in doc.get("pending", []) if p.get("status") == "open")
        # `count` and `subs` are derived signals (D56): a count of three beside a
        # list of one answers "how much is being withheld from you". They are
        # therefore taken over exactly the records this caller may open —
        # tombstones excluded for everyone, since they were never on the active
        # board (§4.7).
        active = [doc for doc in shown.servable(docs, d["code"])
                  if not doc.get("tombstoned")]
        subs = sum(1 for doc in active
                   if isinstance(doc.get("parent"), dict)
                   and shown.sees(doc["parent"].get("process")))
        row = {"code": d["code"], "name": d["name"], "count": len(active),
               "subs": subs}
        if may_edit(f"dept:{d['code']}"):
            row["conflicts"] = conflicts
        out.append(row)
```

The department **row itself stays** even when its count is zero. The row comes from the registry and from the caller's own scope grant, not from content: a reader holding `dept:dining` already knows dining exists, so the row tells them nothing, while removing it would take away the only place the system can say *"nothing here has been confirmed yet"*. The count is honest — it equals the length of the list endpoint's body, which `test_the_board_counts_only_what_the_caller_can_open` pins.

**`routers/pending.py`** — skip tombstones:

```python
        for fp in storage.list_process_files(cfg.data_root, d["code"]):
            doc = storage.read_json(fp)
            if doc.get("tombstoned"):
                # A retained-but-deleted record is excluded entirely (D17), so
                # its unresolved proposals are proposals about a document nobody
                # will read. Edit-gated, so this was never a disclosure — it was
                # an Editor being handed work that cannot matter.
                continue
            for i, p in enumerate(doc.get("pending", [])):
```

- [ ] **Step 5: Confirm the body scan's corpus, or it stops scanning**

`test_body_scan.py`'s scoped-reader sweeps would now walk **empty bodies**, which is the exact failure that file's own docstring calls *"scanning nothing"*. In `_client_as`, after the scopes are inserted and before `conn.close()`, add:

```python
        # D22 — without a confirmation every body a scoped reader gets is empty,
        # and every leak assertion in this file would pass against a backend that
        # leaks freely. `test_a_reader_is_served_the_confirmed_processes` below is
        # what makes that impossible to reintroduce quietly.
        for target, rel in ((MINE, "overview.json"),
                            ("dining-001", "processes/dining-001.json"),
                            ("dining-002", "processes/dining-002.json")):
            path = data_root / "departments" / MINE / rel
            if not path.is_file():
                continue
            doc = json.loads(path.read_text(encoding="utf-8"))
            confirmations.set_confirmation(conn, target=target,
                                           fingerprint=fingerprint(doc),
                                           by="09190000000", at=1770000000)
```

with `from inja_ui_backend.fingerprint import fingerprint` and `from inja_ui_backend.store import confirmations, users` at the top. The tombstoned `dining-003` is deliberately **not** confirmed — it must stay invisible to a reader for its own reason.

Add the guard, at the end of the file:

```python
def test_a_reader_is_served_the_confirmed_processes(corpus, tmp_path):
    """The premise of every scoped sweep in this file.

    D22 makes an unconfirmed department invisible, so a corpus that forgot to
    confirm anything would give every scoped caller an empty body — and an empty
    body passes every leak assertion here against a backend that leaks freely.
    This is where that is diagnosed.
    """
    client = _client_as(corpus, tmp_path, "reader", f"dept:{MINE}")
    listed = client.get(f"/api/departments/{MINE}/processes").json()
    assert [p["id"] for p in listed] == ["dining-001", "dining-002"]
    assert client.get(f"/api/departments/{MINE}/overview").status_code == 200
    # …and the tombstone is still withheld, for its own reason.
    assert client.get(f"/api/processes/{TOMBSTONED}").status_code == 404
```

- [ ] **Step 6: Run everything**

Run: `.venv/bin/pytest ui-backend/tests/test_confirmation_gate.py ui-backend/tests/test_body_scan.py -q`
Expected: PASS.

Run: `.venv/bin/pytest ui-backend/tests -q`
Expected: PASS. `test_endpoint_matrix.py` and every router test sign in as an Editor (`*` or `dept:cooking`), so the gate does not touch them. If `test_departments.py` or `test_processes_read.py` fails, check the caller's role first — a **reader** fixture expecting an unconfirmed document is the test being wrong, not the gate.

- [ ] **Step 7: Prove the gate is not vacuous**

Temporarily make `may_serve` and `servable` return `True`/`list(docs)` unconditionally and re-run `test_confirmation_gate.py`: expected FAIL on the three D23 assertions, both "confirming shows it" tests, the invalidation test and the board-count test. Then make `may_serve` return `False` for everyone including editors: expected FAIL on `test_an_editor_sees_the_unconfirmed_department_in_full` and on `test_a_reader_is_served_the_confirmed_processes`. Revert. Report both.

- [ ] **Step 8: Commit**

```bash
git add ui-backend/inja_ui_backend/disclosure.py ui-backend/inja_ui_backend/routers ui-backend/tests/test_confirmation_gate.py ui-backend/tests/test_body_scan.py
git commit -m "feat(backend): unconfirmed content is invisible, and it is a 404

D22 joins the tombstone rule as one question — may this caller be told this
RECORD exists — asked at the four reading boundaries and answered with the same
uniform 404, because for a non-editor these are not resources they may not act
on but resources they must not learn exist.

The board's count and subs are taken over exactly the records the caller can
open: a count of three beside a list of one answers 'how much is being withheld
from you', which is D56's derived-signals row.

The mark self-invalidates. Nothing clears anything: a re-layout changes the
document and the stored fingerprint stops matching, while a pipeline run
touching source.touched_by does not — which is the whole reason the mark is a
fingerprint and not a boolean.

Also closes the debt P0b handed over: /api/pending now skips tombstones.

test_body_scan's corpus now confirms its dining content, or every scoped sweep
in that file would walk empty bodies and pass against a backend that leaks
freely — the 'scanning nothing' failure its own docstring warns about."
```

---

### Task 8: Confirming and un-confirming, and their two events

**Files:**
- Create: `ui-backend/inja_ui_backend/routers/confirmations.py`, `ui-backend/tests/test_confirmations_api.py`
- Modify: `ui-backend/inja_ui_backend/models.py`, `ui-backend/inja_ui_backend/app.py`
- Modify: `ui-backend/tests/test_body_scan.py` (the route table), `ui-backend/tests/test_endpoint_matrix.py`

**Interfaces:**
- Consumes: `access.requires`, `auth.record`, `store.confirmations`, `fingerprint.fingerprint`, `storage`.
- Produces three routes:
  - `GET /api/confirmations?department={code}` → `[{target, kind, fingerprint, confirmed, confirmed_by, confirmed_at}]`
  - `POST /api/confirmations/{target}` body `{"fingerprint": "<64 hex>"}` → the same row shape
  - `DELETE /api/confirmations/{target}` → the same row shape, `confirmed: false`
- Produces `models.ConfirmBody`.

**Why the client echoes a fingerprint it was given.** The frontend never computes one: canonical JSON in JavaScript would have to agree with Python's byte for byte, over Persian text and float formatting, which is a bug farm and would put the definition of a confirmation in two languages. So `GET` hands out the document's **current** fingerprint and `POST` requires it back. That echo is also the concurrency check D20 needs — an Editor who confirms after the document moved under them is refused with a 409 rather than silently vouching for bytes they never read.

**The gate target is lexical and covers both target shapes in one line.** `storage.dept_of("dining-001")` is `"dining"` and `storage.dept_of("dining")` is `"dining"`, because `rsplit("-", 1)[0]` of a string with no hyphen is the string itself. A malformed target such as `dining-001-x` yields `dept:dining-001`, which `SCOPE_RE` refuses, so `contains` answers `False` even for a `*` holder and the route answers the uniform 404.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_confirmations_api.py`:

```python
"""Confirming and withdrawing (spec D20, D61, §11 test 16's shape)."""
import itertools
import json

import pytest
from fastapi.testclient import TestClient

from inja_ui_backend import db, seed
from inja_ui_backend.access import NOT_FOUND
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.fingerprint import fingerprint
from inja_ui_backend.store import users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
BASE = "https://testserver"
_seq = itertools.count()


def _proc(pid: str, dept: str) -> dict:
    return {
        "id": pid, "department": dept, "name": "پذیرایی", "summary": "خلاصه",
        "source": {"type": "manual", "ref": None, "run": None}, "parent": None,
        "created_at": "2026-07-06T10:00:00Z", "updated_at": "2026-07-06T10:00:00Z",
        "idef0": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
        "kpis": [],
        "nodes": [{"id": f"{pid}-n010", "type": "activity", "label": "کار",
                   "description": "", "actor": "", "subprocess": None,
                   "icom": {"inputs": [], "controls": [], "outputs": [],
                            "mechanisms": []},
                   "position": {"x": 60, "y": 60}, "layout": "auto",
                   "source": {"created_by": "ui", "touched_by": []}}],
        "edges": [], "pending": [],
    }


@pytest.fixture
def corpus(data_root):
    base = data_root / "departments" / "dining"
    for pid in ("dining-001", "dining-002"):
        (base / "processes" / f"{pid}.json").write_text(
            json.dumps(_proc(pid, "dining"), ensure_ascii=False), encoding="utf-8")
    tomb = _proc("dining-003", "dining")
    tomb["tombstoned"] = True
    tomb["superseded_by"] = []
    (base / "processes" / "dining-003.json").write_text(
        json.dumps(tomb, ensure_ascii=False), encoding="utf-8")
    (base / "overview.json").write_text(json.dumps(
        {"department": "dining", "name": "سالن", "description": "شرح",
         "sub_units": [], "personnel": [],
         "updated_at": "2026-07-06T10:00:00Z"}, ensure_ascii=False),
        encoding="utf-8")
    return data_root


def _client_as(data_root, tmp_path, role, *scopes):
    n = next(_seq)
    username = f"0914{n:07d}"
    cfg = cfg_for(data_root, tmp_path / f"cnf-{n}.db")
    conn = db.connect(cfg.app_db)
    try:
        db.migrate(conn)
        seed.seed(conn, editor_username="09190000000", editor_display_name="e",
                  editor_password_hash=hash_password(PW))
        rid = conn.execute("SELECT id FROM roles WHERE name = ?", (role,)).fetchone()[0]
        uid = users.create(conn, username=username, display_name="u",
                           password_hash=hash_password(PW), role_id=rid)
        for s in scopes:
            conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)",
                         (uid, s))
    finally:
        conn.close()
    client = TestClient(create_app(cfg), base_url=BASE)
    assert client.post("/api/auth/login",
                       json={"username": username, "password": PW}).status_code == 200
    client.username = username
    client.app_db = cfg.app_db
    return client


def _events(client, action):
    conn = db.connect(client.app_db)
    try:
        return [dict(r) for r in conn.execute(
            "SELECT actor, action, target, detail FROM audit_events"
            " WHERE action = ? ORDER BY id", (action,))]
    finally:
        conn.close()


def _row(client, target):
    body = client.get("/api/confirmations?department=dining").json()
    return next(r for r in body if r["target"] == target)


# --- the listing hands out the fingerprint the POST has to echo ---

def test_the_listing_names_every_confirmable_target_and_none_confirmed_yet(corpus,
                                                                          tmp_path):
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    body = client.get("/api/confirmations?department=dining").json()
    assert {r["target"] for r in body} == {"dining", "dining-001", "dining-002"}
    # The tombstone is absent: it is excluded entirely (D17), so confirming it
    # would vouch for a document no reader can ever be served.
    assert "dining-003" not in {r["target"] for r in body}
    assert {r["kind"] for r in body} == {"department", "process"}
    assert all(r["confirmed"] is False for r in body)
    assert all(len(r["fingerprint"]) == 64 for r in body)


def test_the_listing_hands_out_the_documents_current_fingerprint(corpus, tmp_path):
    """Computed server-side and echoed by the client, so the definition of a
    confirmation exists in exactly one language."""
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    doc = json.loads((corpus / "departments/dining/processes/dining-001.json")
                     .read_text(encoding="utf-8"))
    assert _row(client, "dining-001")["fingerprint"] == fingerprint(doc)


# --- confirming ---

def test_confirming_records_who_and_what(corpus, tmp_path):
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    fp = _row(client, "dining-001")["fingerprint"]
    r = client.post("/api/confirmations/dining-001", json={"fingerprint": fp})
    assert r.status_code == 200
    assert r.json()["confirmed"] is True
    assert r.json()["confirmed_by"] == client.username
    assert _row(client, "dining-001")["confirmed"] is True

    events = _events(client, "confirmation.set")
    assert len(events) == 1
    assert events[0]["actor"] == client.username
    assert events[0]["target"] == "dining-001"
    assert json.loads(events[0]["detail"])["fingerprint"] == fp


def test_a_department_overview_is_confirmed_the_same_way(corpus, tmp_path):
    """D61 — both apply to either target, which is exactly why the events are
    `confirmation.set`/`confirmation.revoked` and not `process.confirmed`: the
    latter cannot describe confirming a department overview."""
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    fp = _row(client, "dining")["fingerprint"]
    assert client.post("/api/confirmations/dining",
                       json={"fingerprint": fp}).status_code == 200
    assert _events(client, "confirmation.set")[0]["target"] == "dining"


def test_confirming_a_fingerprint_that_is_not_the_current_one_is_refused(corpus,
                                                                        tmp_path):
    """A confirmation vouches for the exact bytes an Editor read (D20). If the
    document moved under them — a pipeline run, another Editor's Save — the mark
    they are about to set would describe a document nobody has reviewed."""
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    r = client.post("/api/confirmations/dining-001", json={"fingerprint": "0" * 64})
    assert r.status_code == 409
    assert _row(client, "dining-001")["confirmed"] is False
    # Refused before anything was written, so there is no event either.
    assert _events(client, "confirmation.set") == []


def test_re_confirming_after_an_edit_replaces_the_mark(corpus, tmp_path):
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    first = _row(client, "dining-001")["fingerprint"]
    client.post("/api/confirmations/dining-001", json={"fingerprint": first})

    path = corpus / "departments/dining/processes/dining-001.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["nodes"][0]["label"] = "کار تازه"
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    row = _row(client, "dining-001")
    assert row["confirmed"] is False and row["fingerprint"] != first
    client.post("/api/confirmations/dining-001",
                json={"fingerprint": row["fingerprint"]})
    assert _row(client, "dining-001")["confirmed"] is True
    conn = db.connect(client.app_db)
    try:
        assert conn.execute("SELECT COUNT(*) FROM confirmations"
                            " WHERE target='dining-001'").fetchone()[0] == 1
    finally:
        conn.close()


# --- withdrawing (D61) ---

def test_withdrawing_emits_revoked_and_not_invalidated(corpus, tmp_path):
    """D61 — withdrawing is deliberate and gets its own event.

    `confirmation.invalidated` is what happens when content changes and the
    fingerprint stops matching. Same visible outcome, different fact, and the
    record has to be able to tell 'the editor decided this was wrong' from 'a
    pipeline run touched it'. Nothing here may emit the second.
    """
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    fp = _row(client, "dining-001")["fingerprint"]
    client.post("/api/confirmations/dining-001", json={"fingerprint": fp})

    r = client.delete("/api/confirmations/dining-001")
    assert r.status_code == 200 and r.json()["confirmed"] is False
    revoked = _events(client, "confirmation.revoked")
    assert len(revoked) == 1
    assert revoked[0]["actor"] == client.username
    assert revoked[0]["target"] == "dining-001"
    assert _events(client, "confirmation.invalidated") == []


def test_withdrawing_something_that_was_never_confirmed_records_nothing(corpus,
                                                                        tmp_path):
    """A decision nobody made must not appear in the record."""
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    assert client.delete("/api/confirmations/dining-002").status_code == 200
    assert _events(client, "confirmation.revoked") == []


# --- the gate ---

def test_an_admin_may_not_confirm_though_they_can_see_the_department(corpus,
                                                                     tmp_path):
    """403, not 404: an Admin holds `view` on dining, so the resource is one they
    can already see and the refusal is about the action (D56)."""
    client = _client_as(corpus, tmp_path, "admin", "dept:dining")
    r = client.post("/api/confirmations/dining-001", json={"fingerprint": "a" * 64})
    assert r.status_code == 403
    assert client.get("/api/confirmations?department=dining").status_code == 403


def test_a_target_in_another_department_is_404_whether_it_exists_or_not(corpus,
                                                                       tmp_path):
    """The gate is lexical, so a real target and an invented one answer alike."""
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    for target in ("cooking-001", "cooking-999", "cooking"):
        r = client.post(f"/api/confirmations/{target}", json={"fingerprint": "a" * 64})
        assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND}), target
        assert client.delete(f"/api/confirmations/{target}").status_code == 404
    assert client.get("/api/confirmations?department=cooking").status_code == 404


def test_a_malformed_target_reaches_nothing_even_for_a_wildcard_holder(corpus,
                                                                       tmp_path):
    """`dining-001-x` derives `dept:dining-001`, which the grammar refuses — so
    who holds `*` must not be readable from which status a nonsense target gets."""
    client = _client_as(corpus, tmp_path, "editor", "*")
    assert client.post("/api/confirmations/dining-001-x",
                       json={"fingerprint": "a" * 64}).status_code == 404
    assert client.get("/api/confirmations").status_code == 404          # no department
    assert client.get("/api/confirmations?department=").status_code == 404


def test_confirming_a_process_that_is_not_on_disk_is_the_uniform_404(corpus,
                                                                    tmp_path):
    client = _client_as(corpus, tmp_path, "editor", "dept:dining")
    r = client.post("/api/confirmations/dining-404", json={"fingerprint": "a" * 64})
    assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_confirmations_api.py -q`
Expected: FAIL — every request 404s from the SPA catch-all / the missing router.

- [ ] **Step 3: Add the request model**

Append to `ui-backend/inja_ui_backend/models.py`:

```python
class ConfirmBody(BaseModel):
    #: The fingerprint the caller was shown for this exact document.
    #:
    #: Echoed rather than recomputed by the client: canonical JSON in the browser
    #: would have to agree with Python's byte for byte over Persian text, and the
    #: definition of a confirmation would then live in two languages. It is also
    #: the concurrency check — an Editor confirming a document that moved under
    #: them is refused rather than left vouching for bytes they never read.
    fingerprint: str
```

- [ ] **Step 4: Write the router**

Create `ui-backend/inja_ui_backend/routers/confirmations.py`:

```python
"""Vouching for content, and withdrawing it (spec D20, D61).

Two acts, one capability. `confirm` permits **setting** a confirmation and
**withdrawing** one, and both apply to either target: a process id or a
department code. The events are therefore `confirmation.set` and
`confirmation.revoked`, each naming its target — **not** `process.confirmed`,
which cannot describe confirming a department overview.

`confirmation.revoked` is deliberate withdrawal and is a different fact from
`confirmation.invalidated`, which is what happens when content changes and the
fingerprint stops matching (D60, and a later sub-project's to emit). Same visible
outcome; *"the editor decided this was wrong"* and *"a pipeline run touched it"*
are not the same event, and nothing here may write the second.

There is no `process.confirmed` field on any document and none may be added
(D20). The confirmation lives in `app.db` and is served by this router alone, so
no reader's body carries it — which is also why the listing is gated on `confirm`
rather than on `view`: everything a non-editor can see is confirmed by
construction, so the only person who needs to know what is *not* confirmed is the
person who can act on it.
"""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import storage
from ..access import NOT_FOUND, requires
from ..auth import record
from ..fingerprint import fingerprint
from ..models import ConfirmBody
from ..store import confirmations

router = APIRouter(prefix="/api/confirmations")


def _target_scope(request: Request) -> str:
    """`dept:{code}` for the target in the path — lexical, and one line for both
    target shapes.

    `storage.dept_of` is `pid.rsplit("-", 1)[0]`, so `dining-001` gives `dining`
    and `dining` — which carries no hyphen — gives itself. That is what lets the
    gate run before anything is loaded, exactly like `routers/processes`'
    `_pid_target`, and it is the whole of D56's existence rule on these two
    routes: read the department out of the stored document and an out-of-scope
    caller learns from the status whether their guess was real.

    A target the grammar refuses (`dining-001-x` → `dept:dining-001`) reaches
    nothing under `contains`, `*` holders included, so it is the same 404 as
    anything else out of scope rather than a 500.
    """
    return f"dept:{storage.dept_of(request.path_params['target'])}"


def _query_scope(request: Request) -> str:
    """`dept:{code}` for the listing, read straight out of the query string.

    Deliberately not a declared `department: str` parameter: FastAPI validates
    declared parameters alongside dependencies, so a missing one could answer 422
    — a different status for "you left it out" than for "not yours" — and the
    gate would no longer be the first thing that speaks. Read raw, an absent
    parameter is `dept:`, which the grammar refuses and which answers the uniform
    404 like every other unreachable target.
    """
    return f"dept:{request.query_params.get('department', '')}"


def _kind(target: str) -> str:
    """`process` or `department`, from the shape of the id and nothing else."""
    return "process" if "-" in target else "department"


def _row(conn, target: str, doc: dict) -> dict:
    """One confirmable target as this router reports it.

    `fingerprint` is the document's **current** one — what a `POST` must echo —
    and `confirmed` is whether the stored mark equals it. Reporting both is what
    lets the client show the state and act on it without ever computing a
    fingerprint of its own.
    """
    now = fingerprint(doc)
    stored = confirmations.get(conn, target)
    ok = stored is not None and stored["fingerprint"] == now
    return {
        "target": target,
        "kind": _kind(target),
        "fingerprint": now,
        "confirmed": ok,
        "confirmed_by": stored["confirmed_by"] if ok else None,
        "confirmed_at": stored["confirmed_at"] if ok else None,
    }


def _load(cfg, target: str) -> dict:
    """The document `target` names, or the uniform 404.

    Safe to touch the filesystem here because the gate has already run: nobody
    outside `dept:{dept_of(target)}` reaches this line, so what is or is not on
    disk is only ever disclosed to someone already inside the department.
    """
    path = (storage.overview_path(cfg.data_root, target) if _kind(target) == "department"
            else storage.proc_path(cfg.data_root, target))
    if not path.is_file():
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return storage.read_json(path)


@router.get("")
def list_confirmations(request: Request,
                       _=Depends(requires("confirm", _query_scope))):
    """Every confirmable target in one department, with its current fingerprint.

    The department itself first, then its **active** processes in curated order.
    Tombstones are absent: D17 excludes them entirely, so confirming one would
    vouch for a document no reader can ever be served.
    """
    cfg = request.app.state.cfg
    conn = request.app.state.db
    code = request.query_params.get("department", "")
    out = []
    overview = storage.overview_path(cfg.data_root, code)
    if overview.is_file():
        out.append(_row(conn, code, storage.read_json(overview)))
    for doc in storage.ordered_processes(cfg.data_root, code):
        if doc.get("tombstoned"):
            continue
        out.append(_row(conn, doc["id"], doc))
    return out


@router.post("/{target}")
def set_confirmation(target: str, body: ConfirmBody, request: Request,
                     user=Depends(requires("confirm", _target_scope))):
    """Vouch for `target` at exactly the fingerprint the caller was shown.

    **409 when the fingerprints disagree**, and that is the point rather than a
    formality: a confirmation vouches for the bytes an Editor read, so a document
    that moved under them — another Editor's Save, a `merge` run — must not come
    away marked as reviewed by somebody who never saw it. 409 rather than 422
    because the body is well formed and the *state* is what conflicts, and rather
    than 404 because the caller is inside the department and learns nothing from
    being told so.
    """
    conn = request.app.state.db
    doc = _load(request.app.state.cfg, target)
    now = fingerprint(doc)
    if body.fingerprint != now:
        raise HTTPException(
            status_code=409,
            detail="این محتوا از زمانی که آن را دیدید تغییر کرده است؛"
                   " دوباره بررسی و تأیید کنید.")
    confirmations.set_confirmation(conn, target=target, fingerprint=now,
                                   by=user["username"], at=int(time.time()))
    record(request, "confirmation.set", actor=user["username"],
           session_id=request.state.session_id, target=target,
           detail={"fingerprint": now, "kind": _kind(target)})
    return _row(conn, target, doc)


@router.delete("/{target}")
def revoke_confirmation(target: str, request: Request,
                        user=Depends(requires("confirm", _target_scope))):
    """Withdraw the mark (D61). Deliberate, and recorded as such.

    No fingerprint in the body: withdrawing says *"whatever is there is wrong"*,
    which does not depend on which version it was. Requiring one would refuse the
    withdrawal precisely when the document has drifted, which is when it is most
    likely to be needed.

    The event is written **only when something was withdrawn**, because a
    decision nobody made must not appear in the record. The response is the same
    200 either way: whether a mark was there is not something the status code has
    to say, and saying it would make this endpoint an existence probe for the
    confirmation state of every id in the department.
    """
    conn = request.app.state.db
    doc = _load(request.app.state.cfg, target)
    if confirmations.revoke(conn, target):
        record(request, "confirmation.revoked", actor=user["username"],
               session_id=request.state.session_id, target=target,
               detail={"kind": _kind(target)})
    return _row(conn, target, doc)
```

- [ ] **Step 5: Register it**

In `ui-backend/inja_ui_backend/app.py`, add the import beside its siblings:

```python
from .routers import confirmations as confirmations_router
```

and include it with the others, before the SPA mount:

```python
    app.include_router(auth_router.router)
    app.include_router(confirmations_router.router)
    app.include_router(departments_router.router)
```

- [ ] **Step 6: Add the three routes to the two coverage tables**

In `ui-backend/tests/test_body_scan.py`, add the read to `DEPT_READS`:

```python
    Route("GET", "/api/confirmations?department={d}", None,
          "/api/confirmations", 200),
```

and the two writes at the **head** of `DEPT_WRITES`, before every route that mutates a document:

```python
DEPT_WRITES = (
    #: First, deliberately: `POST /api/confirmations/{target}` must echo the
    #: document's *current* fingerprint, and every route below this line rewrites
    #: `{d}-001`. `PLANTED_FINGERPRINT` is what the corpus wrote, so it is only
    #: correct while nothing has touched the file yet.
    Route("POST", "/api/confirmations/{d}-001", _the_planted_fingerprint,
          "/api/confirmations/{target}", 200),
    Route("DELETE", "/api/confirmations/{d}-001", None,
          "/api/confirmations/{target}", 200),
    Route("POST", "/api/departments/{d}/exports/steps", None,
          "/api/departments/{code}/exports/{kind}", 200),
    ...
```

with, above the table:

```python
#: Filled in by the `corpus` fixture: the fingerprint of `{d}-001` **as
#: planted**, per department. The sweep cannot compute one — `Route.body` is a
#: callable of the department alone and has no data root — and it must not
#: hard-code one, because the fixture is where the document is decided.
PLANTED_FINGERPRINT: dict[str, str] = {}


def _the_planted_fingerprint(d: str) -> dict:
    """The body `POST /api/confirmations/{d}-001` needs to succeed.

    An empty string for a department the corpus never planted, which is exactly
    right: every route naming another department is refused before the body is
    looked at.
    """
    return {"fingerprint": PLANTED_FINGERPRINT.get(d, "")}
```

and, at the end of the `corpus` fixture, before `return data_root`:

```python
    PLANTED_FINGERPRINT.clear()
    for d in (MINE, THEIRS):
        path = data_root / "departments" / d / "processes" / f"{d}-001.json"
        if path.is_file():
            PLANTED_FINGERPRINT[d] = fingerprint(
                json.loads(path.read_text(encoding="utf-8")))
```

In `ui-backend/tests/test_endpoint_matrix.py`, add to `ROUTES`:

```python
    ("GET", "/api/confirmations?department=cooking", "confirm"),
    ("POST", "/api/confirmations/cooking-001", "confirm"),
    ("DELETE", "/api/confirmations/cooking-001", "confirm"),
```

`test_a_reader_in_scope_is_refused_every_edit` asserts 403 for a capability the Reader lacks; a Reader holds neither `edit` nor `confirm`, so the existing `if capability == "edit"` branch must widen to `if capability in ("edit", "confirm")`. Make that change in both parametrised tests where the string `"edit"` is compared.

- [ ] **Step 7: Run it all**

Run: `.venv/bin/pytest ui-backend/tests/test_confirmations_api.py -q`
Expected: PASS — 11 tests.

Run: `.venv/bin/pytest ui-backend/tests -q`
Expected: PASS, including `test_the_scan_exercises_every_api_route` (the three new routes are now in the table) and `test_the_sweep_reaches_the_body_each_route_really_serves` (the confirmation POST answers 200 because it runs before anything rewrites `dining-001`).

- [ ] **Step 8: Prove the fingerprint precondition bites**

Temporarily delete the `if body.fingerprint != now:` branch and re-run `test_confirmations_api.py`. Expected: `test_confirming_a_fingerprint_that_is_not_the_current_one_is_refused` fails. Revert and report — without that branch the endpoint marks any document as reviewed on request, which is a confirmation system with no confirmation in it.

- [ ] **Step 9: Commit**

```bash
git add ui-backend/inja_ui_backend/routers/confirmations.py ui-backend/inja_ui_backend/models.py ui-backend/inja_ui_backend/app.py ui-backend/tests/test_confirmations_api.py ui-backend/tests/test_body_scan.py ui-backend/tests/test_endpoint_matrix.py
git commit -m "feat(backend): confirming and un-confirming, and two different facts

confirmation.set and confirmation.revoked, each naming its target — not
process.confirmed, which cannot describe confirming a department overview. And
never confirmation.invalidated: that is what happens when content changes and
the fingerprint stops matching, and the record has to be able to tell 'the editor
decided this was wrong' from 'a pipeline run touched it'.

The client echoes a fingerprint the server handed it rather than computing one:
canonical JSON in the browser would have to agree with Python byte for byte over
Persian text, and the definition of a confirmation would live in two languages.
The echo is also the concurrency check — 409 when the document moved under the
Editor, so nobody comes away vouching for bytes they never read.

Withdrawing needs no fingerprint (it says 'whatever is there is wrong') and
writes no event when there was nothing to withdraw.

The gate target is one lexical line for both shapes: dept_of('dining-001') and
dept_of('dining') are both 'dining'."
```

---

### Task 9: The policy endpoint and its event

**Files:**
- Create: `ui-backend/inja_ui_backend/routers/visibility.py`, `ui-backend/tests/test_visibility_api.py`
- Modify: `ui-backend/inja_ui_backend/models.py`, `ui-backend/inja_ui_backend/app.py`
- Modify: `ui-backend/tests/test_body_scan.py` (the route table), `ui-backend/tests/test_endpoint_matrix.py`

**Interfaces:**
- Consumes: `access.requires`, `auth.record`, `store.policy`.
- Produces two routes, both gated on `set_visibility` at `"*"`:
  - `GET /api/visibility` → `{"fields": {…six…}, "version": "<16 hex>"}`
  - `PUT /api/visibility/{field}` body `{"visible": bool}` → the same shape
- Produces `models.VisibilityBody`.

**Why the target is `"*"` and not a department.** There is one global policy (D16). A gate on `dept:{code}` would let a department-scoped Editor change what every other department publishes, and a policy that some Editors may set for everyone is not a global policy — it is a per-department policy with a bug. `*` is also the only target that is honest about the blast radius.

**Why reading it needs the same capability.** Knowing that "node actor is hidden" tells a reader that a field exists which they are not being shown — a derived signal in D56's sense. The screen that reads this is the Editor's, and nobody else needs it.

- [ ] **Step 1: Write the failing test**

Create `ui-backend/tests/test_visibility_api.py`:

```python
"""The policy surface (spec D16, D19)."""
import itertools
import json

import pytest
from fastapi.testclient import TestClient

from inja_ui_backend import db, seed
from inja_ui_backend.access import NOT_FOUND
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.store import policy, users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
BASE = "https://testserver"
_seq = itertools.count()


def _client_as(data_root, tmp_path, role, *scopes):
    n = next(_seq)
    username = f"0915{n:07d}"
    cfg = cfg_for(data_root, tmp_path / f"vis-{n}.db")
    conn = db.connect(cfg.app_db)
    try:
        db.migrate(conn)
        seed.seed(conn, editor_username="09190000000", editor_display_name="e",
                  editor_password_hash=hash_password(PW))
        rid = conn.execute("SELECT id FROM roles WHERE name = ?", (role,)).fetchone()[0]
        uid = users.create(conn, username=username, display_name="u",
                           password_hash=hash_password(PW), role_id=rid)
        for s in scopes:
            conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)",
                         (uid, s))
    finally:
        conn.close()
    client = TestClient(create_app(cfg), base_url=BASE)
    assert client.post("/api/auth/login",
                       json={"username": username, "password": PW}).status_code == 200
    client.username = username
    client.app_db = cfg.app_db
    return client


def _events(client):
    conn = db.connect(client.app_db)
    try:
        return [dict(r) for r in conn.execute(
            "SELECT actor, action, target, detail FROM audit_events"
            " WHERE action = 'visibility.policy.changed' ORDER BY id")]
    finally:
        conn.close()


def test_the_policy_reads_back_d17s_defaults(data_root, tmp_path):
    client = _client_as(data_root, tmp_path, "editor", "*")
    body = client.get("/api/visibility").json()
    assert body["fields"] == {
        "process_summary": False, "process_idef0": False, "process_kpis": False,
        "node_description": True, "node_actor": True, "node_icom": False,
    }
    assert len(body["version"]) == 16


def test_changing_a_field_changes_the_policy_and_the_version(data_root, tmp_path):
    client = _client_as(data_root, tmp_path, "editor", "*")
    before = client.get("/api/visibility").json()
    r = client.put("/api/visibility/node_actor", json={"visible": False})
    assert r.status_code == 200
    assert r.json()["fields"]["node_actor"] is False
    assert r.json()["version"] != before["version"]
    assert client.get("/api/visibility").json() == r.json()


def test_the_event_carries_the_actor_the_field_and_both_values(data_root, tmp_path):
    """D19, in as many words: the actor, the field, and **both** values.

    Both, because 'someone changed node_actor' does not say whether the
    restaurant's internal actor names started or stopped being published — which
    is the only thing anyone reading the record wants to know.
    """
    client = _client_as(data_root, tmp_path, "editor", "*")
    client.put("/api/visibility/process_summary", json={"visible": True})
    events = _events(client)
    assert len(events) == 1
    assert events[0]["actor"] == client.username
    assert events[0]["target"] == "process_summary"
    detail = json.loads(events[0]["detail"])
    assert detail == {"field": "process_summary", "before": False, "after": True}


def test_setting_a_field_to_the_value_it_already_has_is_still_recorded(data_root,
                                                                      tmp_path):
    """An act taken is an act recorded. `before == after` in the detail says what
    happened without the reader having to infer it from silence."""
    client = _client_as(data_root, tmp_path, "editor", "*")
    client.put("/api/visibility/node_actor", json={"visible": True})
    detail = json.loads(_events(client)[0]["detail"])
    assert detail == {"field": "node_actor", "before": True, "after": True}


def test_an_unknown_field_is_the_uniform_404(data_root, tmp_path):
    client = _client_as(data_root, tmp_path, "editor", "*")
    r = client.put("/api/visibility/node_kpis", json={"visible": True})
    assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND})
    # A node has no KPIs (D17), so there is nothing to switch — and nothing was
    # recorded about a change that did not happen.
    assert _events(client) == []


@pytest.mark.parametrize("role", ["reader", "reader_no_download", "admin"])
def test_only_a_holder_of_set_visibility_reaches_it(data_root, tmp_path, role):
    """403 rather than 404: `*` is a scope every one of these callers holds here,
    so the resource is one they can see and the refusal is about the action."""
    client = _client_as(data_root, tmp_path, role, "*")
    assert client.get("/api/visibility").status_code == 403
    assert client.put("/api/visibility/node_actor",
                      json={"visible": False}).status_code == 403


def test_a_department_scoped_editor_cannot_change_the_global_policy(data_root,
                                                                    tmp_path):
    """404 — `*` is outside their scope, and one global policy means the answer
    cannot depend on which department they run. A gate on `dept:{code}` would let
    the head of dining decide what cashier publishes."""
    client = _client_as(data_root, tmp_path, "editor", "dept:dining")
    r = client.put("/api/visibility/node_actor", json={"visible": False})
    assert (r.status_code, r.json()) == (404, {"detail": NOT_FOUND})
    assert client.get("/api/visibility").status_code == 404


def test_the_policy_reaches_the_filter(data_root, tmp_path):
    """The endpoint is not a settings screen with nothing behind it (D16, D18):
    one switch, and every non-editor's body changes."""
    editor = _client_as(data_root, tmp_path, "editor", "*")
    stored = policy.current(db.connect(editor.app_db))
    assert stored["node_actor"] is True
    editor.put("/api/visibility/node_actor", json={"visible": False})
    assert policy.current(db.connect(editor.app_db))["node_actor"] is False
```

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_visibility_api.py -q`
Expected: FAIL — the routes do not exist.

- [ ] **Step 3: Add the request model**

Append to `ui-backend/inja_ui_backend/models.py`:

```python
class VisibilityBody(BaseModel):
    visible: bool
```

- [ ] **Step 4: Write the router**

Create `ui-backend/inja_ui_backend/routers/visibility.py`:

```python
"""The content-visibility policy surface (spec D16, D19).

**Gated on `set_visibility` at `*`, both directions.**

Writing, because there is one global policy: a gate on `dept:{code}` would let a
department-scoped Editor decide what every other department publishes, and a
policy some Editors may set for everyone is not a global policy — it is a
per-department policy with a bug. `*` is the only target honest about the blast
radius, and `set_visibility` is `delegable: false` (D50), so no role holding it
can be created through any API path.

Reading, because knowing that "node actor is hidden" tells a reader a field
exists which they are not being shown — D56's derived-signals row. The only
screen that needs the policy is the Editor's.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from ..access import NOT_FOUND, requires
from ..auth import record
from ..models import VisibilityBody
from ..store import policy

router = APIRouter(prefix="/api/visibility")


def _state(conn) -> dict:
    """The policy and its identity, in one shape both routes answer with.

    `version` travels with the fields because it is what D27 keys the report
    cache on: a client that has just changed a switch can see the key move, and
    an artifact built under a different one is a different artifact.
    """
    return {"fields": policy.current(conn), "version": policy.version(conn)}


@router.get("")
def get_policy(request: Request,
               _=Depends(requires("set_visibility", "*"))):
    return _state(request.app.state.db)


@router.put("/{field}")
def set_policy_field(field: str, body: VisibilityBody, request: Request,
                     user=Depends(requires("set_visibility", "*"))):
    """Move one switch, and say so in the record.

    `NOT_FOUND` for a field nobody declared — the uniform 404, not a 400 naming
    the field, for the same reason every other 404 in this service is uniform.
    Checked before `policy.set_field`, which raises `ValueError` for the same
    case: two guards because this one chooses a status and that one protects the
    table, and the day a second writer appears the data layer is what still holds.

    D19 wants the actor, the field and **both values**, so the previous value
    comes back from `set_field` rather than being re-read afterwards — a
    read-after-write would race itself and could only ever report the new one
    twice.
    """
    if field not in policy.FIELDS:
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    conn = request.app.state.db
    before = policy.set_field(conn, field, body.visible)
    record(request, "visibility.policy.changed", actor=user["username"],
           session_id=request.state.session_id, target=field,
           detail={"field": field, "before": before, "after": body.visible})
    return _state(conn)
```

- [ ] **Step 5: Register it and add it to the two coverage tables**

In `ui-backend/inja_ui_backend/app.py`:

```python
from .routers import visibility as visibility_router
```

and, with the others:

```python
    app.include_router(processes_router.router)
    app.include_router(visibility_router.router)
```

In `ui-backend/tests/test_body_scan.py`, add the read to `GLOBAL_READS` and the write to `GLOBAL_WRITES` — **before** the `logout` entry, which ends the session every route after it would need:

```python
GLOBAL_READS = (
    Route("GET", "/api/auth/me", None, "/api/auth/me", 200),
    Route("GET", "/api/departments", None, "/api/departments", 200),
    Route("GET", "/api/pending", None, "/api/pending", 200),
    Route("GET", "/api/visibility", None, "/api/visibility", 200),
)
```

```python
GLOBAL_WRITES = (
    Route("POST", "/api/auth/login", {"username": "{u}", "password": PW},
          "/api/auth/login", 200),
    #: Left at its default value, so the sweep does not change what every other
    #: test in this file is served. What is scanned is the response body.
    Route("PUT", "/api/visibility/node_actor", {"visible": True},
          "/api/visibility/{field}", 200),
    Route("POST", "/api/auth/password", {"current": PW, "next": NEXT_PW},
          "/api/auth/password", 204),
    Route("POST", "/api/auth/logout", None, "/api/auth/logout", 200),
)
```

`test_the_sweep_reaches_the_body_each_route_really_serves` uses an Editor scoped to `dept:dining`, who does **not** hold `*` — so both visibility routes would answer 404 there rather than the recorded 200. Change that test's client to `_client_as(corpus, tmp_path, "editor", f"dept:{MINE}", "*")`, with the comment:

```python
    # `*` as well as the department: the visibility policy is global (D16), so
    # its two routes are gated on `*` and a department-scoped Editor is 404'd out
    # of them. This test is about whether each route *can* produce its real body,
    # and `test_visibility_api.py` is where the scope refusal is pinned.
```

In `ui-backend/tests/test_endpoint_matrix.py`, add to `ROUTES`:

```python
    ("GET", "/api/visibility", "set_visibility"),
    ("PUT", "/api/visibility/node_actor", "set_visibility"),
```

and widen the refusal branch once more to `if capability in ("edit", "confirm", "set_visibility")`. `test_out_of_scope_is_404_never_403` uses an Editor scoped to `dept:dining` probing `cooking` paths — the two visibility paths name no department, so add them to the same exemption list `/api/pending` already uses:

```python
    if path not in ("/api/pending", "/api/visibility",
                    "/api/visibility/node_actor"):
        assert r.status_code == 404, f"{method} {path} gave {r.status_code}"
```

with the comment: *these two are gated on `*`, which a `dept:dining` Editor also lacks — so they answer 404 for a reason that has nothing to do with cooking, and asserting it here would pass for the wrong reason.*

- [ ] **Step 6: Run it all**

Run: `.venv/bin/pytest ui-backend/tests/test_visibility_api.py -q`
Expected: PASS — 10 tests.

Run: `.venv/bin/pytest ui-backend/tests -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ui-backend/inja_ui_backend/routers/visibility.py ui-backend/inja_ui_backend/models.py ui-backend/inja_ui_backend/app.py ui-backend/tests/test_visibility_api.py ui-backend/tests/test_body_scan.py ui-backend/tests/test_endpoint_matrix.py
git commit -m "feat(backend): one global policy, set at one target

Both routes are gated on set_visibility at '*'. A gate on dept:{code} would let
the head of dining decide what cashier publishes, and a policy some Editors may
set for everyone is not a global policy.

Reading needs the same capability: knowing that 'node actor is hidden' tells a
reader a field exists which they are not being shown.

visibility.policy.changed carries the actor, the field and BOTH values —
'someone changed node_actor' does not say whether internal actor names started
or stopped being published, which is the only thing a reader of the record wants
to know."
```

---

### Task 10: The published bundle — one filter, and the D27 cache key

**Files:**
- Modify: `ui-backend/inja_ui_backend/exports.py` (`build_payload`, `report_key`; remove `PUBLIC_PROCESS_KEYS`/`_public_process`/`_public_node`/`export_token`)
- Modify: `ui-backend/inja_ui_backend/routers/exports.py:117-236` (`create_export`)
- Modify: `ui-backend/tests/test_exports.py`, `ui-backend/tests/test_exports_api.py`

**Interfaces:**
- Consumes: `visibility.filtered`, `visibility.public_overview`, `fingerprint.fingerprint`, `store.policy.current`/`version`, `store.confirmations.stored_for`.
- Produces:
  - `exports.Unconfirmed(ExportUnavailable)` — a department with nothing confirmed to publish.
  - `exports.build_payload(data_root, code, generated_at, *, policy, confirmed) -> dict`
  - `exports.report_key(signing_key, code, kind, *, process_fingerprints, overview_fingerprint, policy_version) -> str` (16 hex chars)

**This task closes the second and third handed-down debts.**

*The cross-department link.* `build_payload` carried one into the published bundle, and P0b left it because the artifact is **cached and shared**: making its contents depend on which Editor pressed Export would give one link two bodies. The resolution is not a per-caller filter but a **caller-independent stance** — the bundle is built for a reader who may see *this department and nothing else*, so `sees` is `dept_of(ref) == code`. That is a fixed rule, identical for every caller (D27: *"the artifact is the same for every caller"*), and it costs nothing: a bundle contains only this department's processes, so a link out of it was never followable inside the file. A `parent` in another department therefore becomes `None`, and the «زیرفرآیند» tag it drives disappears for those — correct, because the tag named a document the bundle does not contain.

*The cache key.* D27 keys the artifact on the fingerprints of every **confirmed** process in curated order, the overview's fingerprint, and the policy version. The third is not optional: the payload is built by the filter, so an Editor switching off "node actor" must change what every cached artifact contains, and keyed on content alone every already-rendered report keeps serving the actor field.

**Two things D27 describes that this task deliberately does not do**, so nobody assumes they were missed: **reuse-on-hit** (skipping the render when the keyed file already exists) and the **report registry** (D26). The key is a *correctness* property — a cache that survives a policy change is a content leak — and it lands here. The reuse is a *performance* property and belongs with the reports sub-project, alongside D25's read-versus-download split and D26's registry, which together decide what a report even is. Pruning already works, unchanged: `write_export` removes every sibling `{kind}-*.html` that is not the file just written, so a key change leaves nothing behind.

**The signing key stays in the digest.** `/exports/{path}` is still served from a publicly mounted folder behind a shared credential (D24 removes that surface in a later sub-project), so a filename anyone can compute from content they can guess would weaken a live guard. HMAC keyed on `SESSION_SIGNING_KEY`, with the content mixed in, keeps both properties: unguessable, and different whenever the content or the policy differs.

- [ ] **Step 1: Write the failing test**

Replace the token tests in `ui-backend/tests/test_exports.py` (lines 74–86) and update every `build_payload` call site. Add at the top of the file:

```python
from inja_ui_backend.fingerprint import fingerprint
from inja_ui_backend.store import policy


def _all_confirmed(root, code: str) -> dict[str, str]:
    """Every process and the overview of `code`, confirmed at what is on disk.

    The bundle publishes only confirmed content (D22), so a payload test with no
    confirmations would assert things about an empty list — and would pass
    against a `build_payload` that had stopped filtering anything at all.
    """
    from inja_ui_backend import storage
    out = {}
    ov = storage.overview_path(root, code)
    if ov.is_file():
        out[code] = fingerprint(storage.read_json(ov))
    for path in storage.list_process_files(root, code):
        doc = storage.read_json(path)
        out[doc["id"]] = fingerprint(doc)
    return out


def _payload(root, code="cooking", at="2026-07-26T09:00:00Z", pol=None, confirmed=None):
    return exports.build_payload(
        root, code, at,
        policy=dict(policy.DEFAULTS) if pol is None else pol,
        confirmed=_all_confirmed(root, code) if confirmed is None else confirmed)
```

Every existing `exports.build_payload(data_root, "cooking", "2026-07-26T09:00:00Z")` becomes `_payload(data_root)`. `test_build_payload_ships_exactly_the_keys_the_documents_render`'s expected set becomes the filter's:

```python
        assert set(proc) == {"id", "department", "name", "parent", "edges",
                             "summary", "idef0", "kpis", "nodes", "pending"}, proc["id"]
```

with its docstring gaining:

```
    The set grew by three — `summary`, `idef0` and `kpis` — and that is the point
    of P1 rather than a regression. They arrive **blanked** under D17's defaults
    and populated the moment an Editor switches one on, which is exactly what
    makes D27's policy-versioned cache key necessary: the same department, the
    same content, a different document.
```

Then add the new tests:

```python
def test_the_bundle_carries_no_cross_department_link(data_root):
    """The debt P0b handed over, closed.

    The artifact is cached and shared (D27), so it cannot depend on which Editor
    pressed Export. The rule is caller-independent instead: the bundle is built
    for a reader who may see *this department and nothing else*, which costs
    nothing — a link out of the bundle was never followable inside it.
    """
    _seed_process(data_root, "cooking", "cooking-002")
    path = data_root / "departments" / "cooking" / "processes" / "cooking-002.json"
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["parent"] = {"process": "dining-777", "node": "dining-777-n010"}
    doc["nodes"][0]["subprocess"] = "dining-888"
    doc["nodes"][1]["subprocess"] = "cooking-001"       # in-department, must stay
    path.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    payload = _payload(data_root)
    text = json.dumps(payload, ensure_ascii=False)
    assert "dining-777" not in text and "dining-888" not in text
    # …and the in-department link survives, or the fix is 'blank every link',
    # which takes the sub-process graph away from the people it is for.
    assert "cooking-001" in text
    proc = next(p for p in payload["processes"] if p["id"] == "cooking-002")
    assert proc["parent"] is None
    assert proc["nodes"][0]["subprocess"] is None
    assert proc["nodes"][1]["subprocess"] == "cooking-001"


def test_the_bundle_publishes_only_confirmed_processes(data_root):
    """D22 — reports render only confirmed processes."""
    _seed_process(data_root, "cooking", "cooking-002")
    confirmed = _all_confirmed(data_root, "cooking")
    del confirmed["cooking-002"]
    payload = _payload(data_root, confirmed=confirmed)
    assert [p["id"] for p in payload["processes"]] == ["cooking-001"]


def test_a_process_whose_content_moved_is_no_longer_published(data_root):
    """The mark is a fingerprint, and the bundle is not a second opinion."""
    confirmed = _all_confirmed(data_root, "cooking")
    confirmed["cooking-001"] = "0" * 64
    assert _payload(data_root, confirmed=confirmed)["processes"] == []


def test_a_department_whose_overview_is_unconfirmed_cannot_be_published(data_root):
    """The overview is confirmed like anything else (D20, D55), and a bundle that
    published an unreviewed introduction would be the one page every reader opens
    first."""
    confirmed = _all_confirmed(data_root, "cooking")
    del confirmed["cooking"]
    with pytest.raises(exports.Unconfirmed):
        _payload(data_root, confirmed=confirmed)


def test_the_policy_decides_what_the_bundle_carries(data_root):
    """§11 test 8 for the artifact, and the reason the cache key needs the policy
    version: the same department and the same content produce two documents."""
    hidden = _payload(data_root)
    shown = _payload(data_root, pol={**policy.DEFAULTS, "process_summary": True})
    assert "خلاصهٔ داخلی این فرآیند" not in json.dumps(hidden, ensure_ascii=False)
    assert "خلاصهٔ داخلی این فرآیند" in json.dumps(shown, ensure_ascii=False)


def test_the_overview_travels_in_full_minus_its_timestamp(data_root):
    payload = _payload(data_root)
    assert "updated_at" not in payload["dept"]
    assert payload["dept"]["description"]


# --- the cache key (§11 test 22) ---

KEY = dict(process_fingerprints=["a" * 64, "b" * 64],
           overview_fingerprint="c" * 64, policy_version="d" * 16)


def test_the_key_is_16_hex_chars_and_stable():
    a = exports.report_key("key", "dining", "flowchart", **KEY)
    assert a == exports.report_key("key", "dining", "flowchart", **KEY)
    assert len(a) == 16 and all(c in "0123456789abcdef" for c in a)


def test_the_key_changes_when_the_visibility_policy_changes():
    """The clause that is a content leak if it fails, not a stale page: the
    payload is built by the filter, so a cached artifact must not survive the
    switch that changed what it contains."""
    base = exports.report_key("key", "dining", "flowchart", **KEY)
    assert base != exports.report_key("key", "dining", "flowchart",
                                      **{**KEY, "policy_version": "e" * 16})


def test_the_key_changes_when_a_process_is_confirmed_or_edited():
    base = exports.report_key("key", "dining", "flowchart", **KEY)
    assert base != exports.report_key(
        "key", "dining", "flowchart",
        **{**KEY, "process_fingerprints": ["a" * 64, "b" * 64, "f" * 64]})
    assert base != exports.report_key(
        "key", "dining", "flowchart",
        **{**KEY, "process_fingerprints": ["a" * 64, "f" * 64]})


def test_the_key_changes_when_the_department_is_reordered():
    """order.json is the document's table of contents: a reorder changes what the
    reader receives while changing no process."""
    base = exports.report_key("key", "dining", "flowchart", **KEY)
    assert base != exports.report_key(
        "key", "dining", "flowchart",
        **{**KEY, "process_fingerprints": ["b" * 64, "a" * 64]})


def test_the_key_changes_when_the_overview_changes():
    base = exports.report_key("key", "dining", "flowchart", **KEY)
    assert base != exports.report_key("key", "dining", "flowchart",
                                      **{**KEY, "overview_fingerprint": "e" * 64})


def test_the_key_still_differs_by_department_kind_and_signing_key():
    """The properties `export_token` had, kept: the folder is publicly mounted
    and the filename is still a guard until D24 removes that surface."""
    base = exports.report_key("key", "dining", "flowchart", **KEY)
    assert base != exports.report_key("key", "dining", "steps", **KEY)
    assert base != exports.report_key("key", "cooking", "flowchart", **KEY)
    assert base != exports.report_key("other", "dining", "flowchart", **KEY)
```

Delete `test_token_is_16_hex_chars_and_stable` and `test_token_differs_by_kind_department_and_key`; the six key tests above replace them.

- [ ] **Step 2: Run it and watch it fail**

Run: `.venv/bin/pytest ui-backend/tests/test_exports.py -q`
Expected: FAIL — `build_payload() got an unexpected keyword argument 'policy'`, and `module 'inja_ui_backend.exports' has no attribute 'report_key'`.

- [ ] **Step 3: Rewrite the payload builder**

In `ui-backend/inja_ui_backend/exports.py`, delete `export_token`, `PUBLIC_PROCESS_KEYS`, `_empty_icom`, `_empty_node_source`, `_public_node` and `_public_process` (they now live in `visibility.py`), add `from . import storage, visibility` and `from .fingerprint import fingerprint`, and replace `build_payload` with:

```python
class Unconfirmed(ExportUnavailable):
    """The department has nothing an Editor has vouched for (D22, D23)."""


def build_payload(data_root: Path, code: str, generated_at: str, *,
                  policy: dict[str, bool], confirmed: dict[str, str]) -> dict:
    """What the template renders: the overview, the processes, the timestamp.

    **The same filter every API response goes through** (`visibility.filtered`,
    D18). One implementation means the published artifact and the flow canvas
    cannot disagree about what a reader may have — and it means an Editor moving
    a switch changes both at once, which is what D27's policy-versioned cache key
    exists to make safe.

    **Built for a reader who may see this department and nothing else.** That is
    the caller-independent stance D27 requires — *"the artifact is the same for
    every caller… permission decides whether it is served, never what it
    contains"* — and it is what closes the cross-department link that used to
    travel in here. Making the contents depend on which Editor pressed Export
    would give one link two different bodies, which is a different design and not
    a filter; fixing it to *this department* costs nothing, because a bundle
    contains only this department's processes and a link out of it was never
    followable inside the file.

    **Only confirmed content is published** (D22). `confirmed` maps a target — a
    process id or this department's code — to the fingerprint an Editor vouched
    for; a process whose current fingerprint differs is absent, and an
    unconfirmed overview raises `Unconfirmed` rather than publishing an
    introduction nobody has reviewed. The caller resolves `confirmed` because
    this module has no database and is not about to grow one.

    Tombstoned processes are dropped before the confirmation question is even
    asked: they are excluded entirely (D17) and `storage.ordered_processes`
    returns them last rather than dropping them.
    """
    overview = storage.overview_path(data_root, code)
    if not overview.is_file():
        raise ExportUnavailable(f"department {code} has no overview.json")
    ov = storage.read_json(overview)
    if confirmed.get(code) != fingerprint(ov):
        raise Unconfirmed(
            f"department {code}'s overview carries no valid confirmation")

    def sees(ref: object) -> bool:
        """Lexical, like every other reachability question in this service: the
        department is the id's own prefix and nothing is opened to find out."""
        return isinstance(ref, str) and storage.dept_of(ref) == code

    procs = []
    for doc in storage.ordered_processes(data_root, code):
        if doc.get("tombstoned"):
            continue
        if confirmed.get(doc.get("id")) != fingerprint(doc):
            continue
        procs.append(visibility.filtered(doc, policy=policy, sees=sees,
                                         editor=False))
    return {
        "dept": visibility.public_overview(ov, editor=False),
        "processes": procs,
        "generated_at": generated_at,
    }


def report_key(signing_key: str, code: str, kind: str, *,
               process_fingerprints: list[str], overview_fingerprint: str,
               policy_version: str) -> str:
    """The artifact's identity (D27) — 16 hex chars, keyed by the signing key.

    A digest over three things, and the third is not optional:

    1. the fingerprints of every **confirmed** process in the department, **in
       curated order** — order is part of the key because `order.json` is the
       document's table of contents and a reorder changes what the reader
       receives while changing no process;
    2. the department overview's fingerprint;
    3. the version of the content-visibility policy.

    Without (3), an Editor switching off "node actor" leaves every
    already-rendered report serving it: a cache that survives a policy change is
    a content leak, not a stale page.

    **HMAC on `SESSION_SIGNING_KEY` rather than a bare SHA-256**, which keeps
    what the old derived token bought: `/exports/{path}` is served from a
    publicly mounted folder whose filename is still a guard until D24 removes
    that surface, and a name anyone can compute from guessable content would not
    be one. Rotating the key rotates every link, and `write_export`'s prune
    clears the orphan that leaves behind.

    Each part is length-delimited by a NUL prefix so that two different lists
    cannot serialise to the same bytes. Hex digests contain no NUL, so the
    delimiter is unambiguous.
    """
    mac = hmac.new(signing_key.encode("utf-8"), digestmod=hashlib.sha256)
    for part in (f"export:{code}:{kind}", overview_fingerprint, policy_version,
                 *process_fingerprints):
        mac.update(b"\x00")
        mac.update(part.encode("utf-8"))
    return mac.hexdigest()[:16]
```

- [ ] **Step 4: Wire the endpoint**

In `ui-backend/inja_ui_backend/routers/exports.py`, add the imports:

```python
from ..fingerprint import fingerprint
from ..store import confirmations, policy
```

Replace the `generated_at`/`payload` block (currently lines 177–205) with:

```python
    conn = request.app.state.db
    active = [doc for doc in storage.ordered_processes(cfg.data_root, code)
              if not doc.get("tombstoned")]
    # One statement for the whole department (D56: filtered in the query), and
    # the department's own code alongside its processes, because the overview is
    # a confirmable target too (D20, D55).
    stored = confirmations.stored_for(conn, [code] + [d["id"] for d in active])
    current_policy = policy.current(conn)

    generated_at = _now()
    try:
        payload = exports.build_payload(cfg.data_root, code, generated_at,
                                        policy=current_policy, confirmed=stored)
    except exports.Unconfirmed as e:
        # 409, like the missing overview below and for the same reason: the
        # caller passed the gate, so being told the department is not in an
        # exportable state discloses nothing about their scope boundary — and it
        # is the one answer that tells an Editor what to go and do.
        logger.info("%s/%s: %s", code, kind, e)
        raise HTTPException(
            status_code=409,
            detail="معرفی این دپارتمان هنوز تأیید نشده است؛"
                   " ابتدا آن را بررسی و تأیید کنید.") from e
    except exports.ExportUnavailable as e:
        # A department with no overview.json has nothing to document yet: the
        # likeliest failure on the whole handler, and the only one that tells a
        # user what to go and do.
        #
        # **409, not 404, and that is what lets it keep saying so.** The uniform
        # `NOT_FOUND` body exists because a self-describing 404 describes the
        # caller's scope boundary — an `export_pdf` holder scoped
        # `dept:{code}/report:{kind}` passes the gate above without holding
        # `view` on the department, so "this department has no introduction yet"
        # in a *404* would separate "not there" from "not yours" for them. A 409
        # is not in that partition at all.
        logger.warning("%s/%s: %s", code, kind, e)
        raise HTTPException(
            status_code=409,
            detail="اطلاعات معرفی این دپارتمان هنوز ثبت نشده است؛"
                   " ابتدا معرفی واحد را کامل کنید.") from e
```

**`Unconfirmed` is caught first, and it must stay first:** it is a subclass of `ExportUnavailable`, so a reversed order would answer "complete the introduction" for a department whose introduction is complete but unreviewed.

Then replace the token line (currently line 218):

```python
    # The key is the content, not the department (D27): the fingerprints of the
    # confirmed processes in curated order, the overview's, and the policy
    # version. `build_payload` published exactly the processes below, so the two
    # cannot disagree about what this file contains.
    published = [fingerprint(doc) for doc in active
                 if stored.get(doc["id"]) == fingerprint(doc)]
    token = exports.report_key(
        cfg.session_signing_key, code, kind,
        process_fingerprints=published,
        overview_fingerprint=fingerprint(storage.read_json(
            storage.overview_path(cfg.data_root, code))),
        policy_version=policy.version(conn))
```

- [ ] **Step 5: Fix the API tests**

In `ui-backend/tests/test_exports_api.py`, every test that expects a 200 from `POST /api/departments/{code}/exports/{kind}` now needs the department's content confirmed. Add a helper near the top and call it in each such test's arrangement:

```python
def confirm_everything(cfg, code: str) -> None:
    """Vouch for every active process and the overview of `code`.

    D22 — the bundle publishes only confirmed content, so without this every
    export test here would assert things about an empty document, and the ones
    checking a 200 would get a 409. Written straight to the store on its own
    connection: what these tests are about is the export, not the confirmation
    endpoint (`test_confirmations_api.py` owns that).
    """
    from inja_ui_backend import db, storage
    from inja_ui_backend.fingerprint import fingerprint
    from inja_ui_backend.store import confirmations

    conn = db.connect(cfg.app_db)
    try:
        ov = storage.overview_path(cfg.data_root, code)
        if ov.is_file():
            confirmations.set_confirmation(
                conn, target=code, fingerprint=fingerprint(storage.read_json(ov)),
                by="09120000000", at=1770000000)
        for path in storage.list_process_files(cfg.data_root, code):
            doc = storage.read_json(path)
            if doc.get("tombstoned"):
                continue
            confirmations.set_confirmation(
                conn, target=doc["id"], fingerprint=fingerprint(doc),
                by="09120000000", at=1770000000)
    finally:
        conn.close()
```

Line 404's `exports_mod.export_token(cfg.session_signing_key, code, kind)` becomes a read of the URL the endpoint returned rather than a recomputation — the key now depends on content the test would have to mirror:

```python
    # The key is content-derived (D27), so recomputing it here would mean
    # restating the department's fingerprints in a test — the returned URL is the
    # authority on where the file went, and `write_export` is what guarantees the
    # PDF sits beside it under the same stem.
    url = r.json()["url"]
    stem = url.rsplit("/", 1)[-1].removesuffix(".html")
    token = stem.split("-", 1)[1]
```

Add one new test to that file:

```python
def test_a_department_with_nothing_confirmed_cannot_be_exported(data_root, tmp_path):
    """D22/D23 — an unconfirmed department has nothing to publish, and the answer
    says what to go and do rather than hiding behind the uniform 404."""
    client, cfg = signed_in_client(data_root, tmp_path / "app.db")
    r = client.post("/api/departments/cooking/exports/steps")
    assert r.status_code == 409
    assert "تأیید" in r.json()["detail"]


def test_moving_a_visibility_switch_changes_the_export_url(data_root, tmp_path):
    """§11 test 22, end to end. If this fails, the already-rendered document keeps
    serving the field the Editor just switched off — a content leak, not a stale
    page."""
    client, cfg = signed_in_client(data_root, tmp_path / "app.db")
    confirm_everything(cfg, "cooking")
    first = client.post("/api/departments/cooking/exports/steps").json()["url"]
    assert client.put("/api/visibility/process_summary",
                      json={"visible": True}).status_code == 200
    second = client.post("/api/departments/cooking/exports/steps").json()["url"]
    assert first != second
```

(These need whatever `signed_in_client`/`cfg` arrangement the surrounding file already uses for a configured `EXPORT_DIR`; follow the pattern of the file's existing 200-expecting export tests.)

- [ ] **Step 6: Run it all**

Run: `.venv/bin/pytest ui-backend/tests/test_exports.py ui-backend/tests/test_exports_api.py -q`
Expected: PASS.

Run: `.venv/bin/pytest ui-backend/tests -q`
Expected: PASS. `test_body_scan.py`'s export route stays at 200 because its corpus is confirmed (Task 7, Step 5).

- [ ] **Step 7: Prove the key's policy ingredient is load-bearing**

Temporarily drop `policy_version` from `report_key`'s digest (keep the parameter, ignore it) and re-run: expected FAIL on `test_the_key_changes_when_the_visibility_policy_changes` **and** `test_moving_a_visibility_switch_changes_the_export_url`. Then drop `process_fingerprints`: expected FAIL on the confirm/edit and reorder tests. Revert both and report.

- [ ] **Step 8: Commit**

```bash
git add ui-backend/inja_ui_backend/exports.py ui-backend/inja_ui_backend/routers/exports.py ui-backend/tests/test_exports.py ui-backend/tests/test_exports_api.py
git commit -m "feat(backend): the bundle reads the one filter, and the key knows the policy

exports no longer carries its own whitelist: build_payload calls
visibility.filtered, so the published artifact and the flow canvas cannot
disagree about what a reader may have.

Closes the cross-department link P0b handed over. The artifact is cached and
shared, so it cannot depend on which Editor pressed Export — the rule is
caller-independent instead: the bundle is built for a reader who may see this
department and nothing else. It costs nothing, because a link out of a bundle
was never followable inside it.

The filename is now D27's key: the fingerprints of the confirmed processes in
curated order, the overview's, and the policy version. The third is not
optional — the payload is built by the filter, so a cache that survives a policy
change is a content leak rather than a stale page. Still an HMAC on the signing
key, because /exports is publicly mounted and the filename is still a guard.

Only confirmed content is published (D22), and an unconfirmed overview is a 409
that says what to go and do."
```

---

### Task 11: The confirmation mark, and the fields a reader no longer receives

**Files:**
- Create: `ui/src/write/ConfirmMark.tsx`, `ui/src/write/ConfirmMark.test.tsx`
- Modify: `ui/src/api/types.ts`, `ui/src/api/hooks.ts`
- Modify: `ui/src/screens/Overview.tsx`, `ui/src/screens/ProcessList.tsx`, `ui/src/screens/Summary.tsx`

**Interfaces:**
- Consumes: `GET/POST/DELETE /api/confirmations` (Task 8), `useCan` from `ui/src/auth/can.ts`.
- Produces:
  - `types.Confirmation = { target: string; kind: 'process' | 'department'; fingerprint: string; confirmed: boolean; confirmed_by: string | null; confirmed_at: number | null }`
  - `hooks.useConfirmations(code: string, opts?: { enabled?: boolean })`
  - `hooks.useSetConfirmation()` — `mutate({ target, fingerprint })`
  - `hooks.useRevokeConfirmation()` — `mutate(target)`
  - `<ConfirmMark row={Confirmation | undefined} department={string} />`

**The three optional fields.** A non-editor's process no longer carries `source`, `created_at` or `updated_at`, and their overview no longer carries `updated_at`. Nothing under `ui/src/` reads the process-level three, so those are a type change only; `Overview.tsx:64` renders `jalali(data.updated_at)` and **would print an Invalid Date** — that line is the one real runtime consequence and it is fixed here.

- [ ] **Step 1: Write the failing test**

Create `ui/src/write/ConfirmMark.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfirmMark } from './ConfirmMark'
import type { Confirmation } from '../api/types'
import type { SessionDescriptor } from '../auth/session'

vi.mock('../auth/useSession', () => ({ useSession: () => ({ data: session }) }))

let session: SessionDescriptor | undefined

const EDITOR: SessionDescriptor = {
  username: '09120000000', displayName: 'و', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers',
                 'view_audit', 'edit', 'confirm', 'set_visibility'],
  scopes: ['dept:dining'], supervisor: null, canSupervise: false,
  pendingApprovals: 0,
}
const READER: SessionDescriptor = {
  username: '09120000001', displayName: 'خ', role: 'reader',
  capabilities: ['view', 'comment', 'export_pdf'], scopes: ['dept:dining'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}

const CONFIRMED: Confirmation = {
  target: 'dining-001', kind: 'process', fingerprint: 'a'.repeat(64),
  confirmed: true, confirmed_by: '09120000000', confirmed_at: 1770000000,
}
const UNCONFIRMED: Confirmation = { ...CONFIRMED, confirmed: false,
  confirmed_by: null, confirmed_at: null }

function mount(row: Confirmation | undefined, who: SessionDescriptor | undefined) {
  session = who
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ConfirmMark row={row} department="dining" />
    </QueryClientProvider>,
  )
}

describe('ConfirmMark', () => {
  it('says a process is unconfirmed, and says who cannot see it', () => {
    mount(UNCONFIRMED, EDITOR)
    expect(screen.getByText('تأیید نشده')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'تأیید محتوا' })).toBeInTheDocument()
  })

  it('says a process is confirmed and offers the withdrawal', () => {
    mount(CONFIRMED, EDITOR)
    expect(screen.getByText('تأیید شده')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'لغو تأیید' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تأیید محتوا' })).toBeNull()
  })

  it('draws nothing at all for someone who cannot confirm', () => {
    // Not a disabled button and not a greyed mark: a reader only ever sees
    // confirmed content, so a mark would say something that is true of
    // everything they can see and therefore says nothing. The server refuses
    // regardless (D48) — this is about not drawing a control nobody can use.
    const { container } = mount(UNCONFIRMED, READER)
    expect(container).toBeEmptyDOMElement()
  })

  it('draws nothing while the row has not arrived', () => {
    const { container } = mount(undefined, EDITOR)
    expect(container).toBeEmptyDOMElement()
  })
})
```

Create `ui/src/screens/Overview.confirm.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { jalali } from '../lib/format'

describe('the overview date a reader never receives', () => {
  it('jalali would print an invalid date for a missing timestamp', () => {
    // The premise. `updated_at` is stripped for every non-editor (D55/D17), so
    // the unguarded `jalali(data.updated_at)` printed «NaN/NaN/NaN» to exactly
    // the people the strip is for. If this ever stops being true, the guard in
    // Overview.tsx can go.
    expect(jalali(undefined as unknown as string)).toContain('NaN')
  })

  it('renders no update line when the overview carries no timestamp', async () => {
    const { Overview } = await import('./Overview')
    const { renderOverview } = await import('../test/render-overview')
    renderOverview(Overview, {
      department: 'dining', name: 'سالن', description: 'شرح',
      sub_units: [], personnel: [],
    })
    expect(screen.queryByText(/آخرین به‌روزرسانی/)).toBeNull()
  })
})
```

> `ui/src/test/render-overview.tsx` is a two-line helper: it wraps the screen in the same `QueryClientProvider` + `MemoryRouter` the existing `Overview` tests use and seeds `['overview', 'dining']` with the given document. Copy the arrangement from the current `ui/src/screens/Overview.test.tsx` rather than inventing a second one; if that file already exports such a helper, import it and delete this note.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd ui && npx vitest run src/write/ConfirmMark.test.tsx src/screens/Overview.confirm.test.tsx`
Expected: FAIL — `Failed to resolve import "./ConfirmMark"`, and the Overview test finds «آخرین به‌روزرسانی: NaN/NaN/NaN».

- [ ] **Step 3: Types and hooks**

In `ui/src/api/types.ts`, make the three process fields and the overview timestamp optional, and add the two new shapes:

```ts
export interface Process {
  id: string; department: string; name: string; summary: string
  /** Absent for a non-editor: process provenance is D17 never-shown bookkeeping
   *  and nothing in this app renders it. `?` rather than a lie — the server
   *  really does not send it, and a reader of this type has to deal with that. */
  source?: { type: 'voice' | 'manual' | 'chat' | 'auto'; ref: string | null; run: string | null }
  parent: { process: string; node: string } | null
  /** Absent for a non-editor, for the same reason. */
  created_at?: string; updated_at?: string
  idef0: Icom; kpis: Kpi[]; nodes: ProcNode[]; edges: Edge[]; pending: Pending[]
  superseded_by?: string[]
  tombstoned?: boolean
}
```

```ts
export interface Overview {
  department: string; name: string
  description: string
  sub_units: { name: string; description: string }[]
  personnel: { role: string; duties: string[]; kpi: string[] }[]
  /** Stripped for every non-editor (D55): bookkeeping, not content. The page is
   *  otherwise shown in full — there are no per-field switches for it. */
  updated_at?: string
}

/** One confirmable target as `GET /api/confirmations` reports it (D20).
 *
 *  `fingerprint` is the document's **current** one, and confirming echoes it
 *  back: the client never computes a fingerprint, because canonical JSON here
 *  would have to agree with Python's byte for byte and the definition of a
 *  confirmation would live in two languages. */
export interface Confirmation {
  target: string
  kind: 'process' | 'department'
  fingerprint: string
  confirmed: boolean
  confirmed_by: string | null
  confirmed_at: number | null
}
```

`ReadableProcess` keeps its `Omit` list unchanged: it already omits all four of `summary`, `source`, `created_at` and `updated_at`, and omitting an optional property is legal.

In `ui/src/api/hooks.ts`, add:

```ts
export const useConfirmations = (code: string, opts?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['confirmations', code],
    queryFn: () => fetchJson<Confirmation[]>(`/api/confirmations?department=${code}`),
    // Gated on the capability by the caller: a reader is 403'd here, and firing
    // the query anyway would put a refusal in the console on every page load.
    enabled: opts?.enabled ?? true,
  })

export function useSetConfirmation(code: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ target, fingerprint }: { target: string; fingerprint: string }) =>
      fetchJson<Confirmation>(`/api/confirmations/${target}`,
        { method: 'POST', body: JSON.stringify({ fingerprint }) }),
    // The list is what carries every target's current fingerprint, and the
    // department board's counts move with a confirmation for every reader.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['confirmations', code] })
      qc.invalidateQueries({ queryKey: ['departments'] })
    },
  })
}

export function useRevokeConfirmation(code: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (target: string) =>
      fetchJson<Confirmation>(`/api/confirmations/${target}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['confirmations', code] })
      qc.invalidateQueries({ queryKey: ['departments'] })
    },
  })
}
```

with `Confirmation` added to the `import type` list at the top.

- [ ] **Step 4: Write the component**

Create `ui/src/write/ConfirmMark.tsx`:

```tsx
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { useSetConfirmation, useRevokeConfirmation } from '../api/hooks'
import { StatusPill } from '../ui/StatusPill'
import { Button } from '../ui/Button'
import type { Confirmation } from '../api/types'

/**
 * Whether an Editor has vouched for this exact document, and the two acts that
 * change it (spec D20, D61).
 *
 * **Drawn for nobody but a holder of `confirm` on this department.** Not a
 * disabled button and not a greyed mark: a non-editor is only ever served
 * content that *is* confirmed (D22), so a mark would state something true of
 * everything they can see and therefore say nothing at all. Cosmetic either way
 * — the endpoints re-derive the capability and refuse regardless (D48).
 *
 * **The fingerprint comes from the server and goes straight back.** The client
 * computes none: canonical JSON here would have to agree with Python's byte for
 * byte over Persian text, and the definition of a confirmation would then live
 * in two languages. Echoing it is also what makes a stale screen fail loudly —
 * the POST answers 409 when the document moved, rather than marking bytes
 * nobody read as reviewed.
 */
export function ConfirmMark({ row, department }:
  { row: Confirmation | undefined; department: string }) {
  const can = useCan(useSession().data)
  const set = useSetConfirmation(department)
  const revoke = useRevokeConfirmation(department)
  // Hooks first, then the early return: an early return above them would change
  // hook order between renders the moment the row arrives.
  if (!row || !can('confirm', `dept:${department}`)) return null

  return (
    <span className="inline-flex items-center gap-s5">
      <StatusPill tone={row.confirmed ? 'ok' : 'warn'}
        label={row.confirmed ? 'تأیید شده' : 'تأیید نشده'} />
      {row.confirmed ? (
        <Button variant="ghost" onClick={() => revoke.mutate(row.target)}
          loading={revoke.isPending} loadingLabel="در حال لغو…">لغو تأیید</Button>
      ) : (
        <Button variant="green" loading={set.isPending} loadingLabel="در حال تأیید…"
          onClick={() => set.mutate({ target: row.target,
                                      fingerprint: row.fingerprint })}>
          تأیید محتوا
        </Button>
      )}
    </span>
  )
}
```

- [ ] **Step 5: Place it, and guard the overview date**

**`ui/src/screens/ProcessList.tsx`** — fetch the rows and draw a mark per process. After the existing `mayEdit` line:

```tsx
  const mayConfirm = useCan(useSession().data)('confirm', `dept:${code}`)
  const { data: marks = [] } = useConfirmations(code, { enabled: mayConfirm })
  const markOf = new Map(marks.map((m) => [m.target, m]))
```

and inside the row's tag line, after the `<span className={…TAG_CLS…}>` element:

```tsx
                    <ConfirmMark row={markOf.get(p.id)} department={code} />
```

**`ui/src/screens/Summary.tsx`** — the review surface. After the `mayEdit` line:

```tsx
  const mayConfirm = can('confirm', `dept:${proc.department}`)
  const { data: marks = [] } = useConfirmations(proc.department, { enabled: mayConfirm })
```

and beside the id badge, after the «زیرفرآیند» span:

```tsx
              <ConfirmMark row={marks.find((m) => m.target === proc.id)}
                department={proc.department} />
```

> `useConfirmations` must be called **above** the `if (refused)` / `if (!p)` early returns, which means moving those two returns below it or hoisting the hook. Hoist the hook: `useParams` gives the `pid`, and `pid.replace(/-\d+$/, '')` is the department by the same lexical rule the server uses — do **not** read `proc.department`, which is only available after the early return and which the server never trusts either.

**`ui/src/screens/Overview.tsx`** — the department's own mark, and the date guard. Replace line 64:

```tsx
              {data.updated_at && (
                <div className="text-xs text-faint mt-1">آخرین به‌روزرسانی: {jalali(data.updated_at)}</div>
              )}
```

and add the mark beside the department name (inside the same `<div>` that holds `{data.name}`):

```tsx
              <ConfirmMark row={marks.find((m) => m.target === code)} department={code} />
```

with, above the early returns:

```tsx
  const mayConfirm = useCan(useSession().data)('confirm', `dept:${code}`)
  const { data: marks = [] } = useConfirmations(code, { enabled: mayConfirm })
```

- [ ] **Step 6: Verify**

Run: `cd ui && npx vitest run`
Expected: PASS — 555 existing plus the new ones. If an existing `Overview` or `Summary` test fails on a missing `updated_at`, its fixture is now the more realistic one and the assertion is what to change.

Run: `cd ui && npx tsc -b && npm run lint && npm run build`
Expected: exit 0 each. **`npm run build` is not optional** — three bugs in an earlier sub-project were invisible to vitest and tsc and visible only here.

- [ ] **Step 7: Commit**

```bash
git add ui/src/write/ConfirmMark.tsx ui/src/write/ConfirmMark.test.tsx ui/src/api ui/src/screens ui/src/test
git commit -m "feat(ui): the confirmation mark, and the fields a reader no longer gets

The mark is drawn for nobody but a holder of confirm on that department — not
greyed, not disabled. A non-editor is only ever served confirmed content, so a
mark would state something true of everything they can see.

The fingerprint comes from the server and goes straight back: the client
computes none, because canonical JSON here would have to agree with Python's
byte for byte and the definition of a confirmation would live in two languages.

Process source/created_at/updated_at and overview updated_at are now optional,
because the server really does strip them. The one runtime consequence was the
overview's unguarded jalali(data.updated_at), which printed NaN/NaN/NaN to
exactly the people the strip is for."
```

---

### Task 12: The visibility policy screen

**Files:**
- Create: `ui/src/screens/Visibility.tsx`, `ui/src/screens/Visibility.test.tsx`
- Modify: `ui/src/api/types.ts`, `ui/src/api/hooks.ts`, `ui/src/routes.tsx`, `ui/src/shell/PanelShell.tsx`

**Interfaces:**
- Consumes: `GET /api/visibility`, `PUT /api/visibility/{field}` (Task 9), `useCan`.
- Produces:
  - `types.PolicyField` (a union of the six), `types.VisibilityPolicy = { fields: Record<PolicyField, boolean>; version: string }`
  - `hooks.useVisibility()`, `hooks.useSetVisibilityField()`
  - the `/visibility` route.

**`ui/src/shell/PanelShell.tsx` is policed by `guards.test.ts`** — it is not in `PENDING_REBUILD`. The nav entry must use tokens only: `text-caption`, `rounded-control`, `min-h-touch`/`min-w-touch`, `bg-transparent`, `hover:bg-tile-v2`, `text-card`. No hex, no `text-[…]`, no `ml-`/`mr-`/`text-left`, no `dir=`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/screens/Visibility.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Visibility } from './Visibility'
import type { SessionDescriptor } from '../auth/session'

let session: SessionDescriptor | undefined
vi.mock('../auth/useSession', () => ({ useSession: () => ({ data: session }) }))

const EDITOR: SessionDescriptor = {
  username: '09120000000', displayName: 'و', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers',
                 'view_audit', 'edit', 'confirm', 'set_visibility'],
  scopes: ['*'], supervisor: null, canSupervise: false, pendingApprovals: 0,
}

const DEFAULTS = {
  process_summary: false, process_idef0: false, process_kpis: false,
  node_description: true, node_actor: true, node_icom: false,
}

let put: { path: string; body: unknown } | null

beforeEach(() => {
  put = null
  session = EDITOR
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      put = { path, body: JSON.parse(String(init.body)) }
      return new Response(JSON.stringify(
        { fields: { ...DEFAULTS, node_actor: false }, version: 'ffffffffffffffff' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ fields: DEFAULTS, version: '0123456789abcdef' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
})

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><Visibility /></QueryClientProvider>)
}

describe('the visibility policy screen', () => {
  it('lists all six switches with the values the server sent', async () => {
    mount()
    const boxes = await screen.findAllByRole('checkbox')
    expect(boxes).toHaveLength(6)
    expect(screen.getByRole('checkbox', { name: 'مسئول فعالیت' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'خلاصهٔ فرآیند' })).not.toBeChecked()
  })

  it('sends one field at a time, naming it in the path', async () => {
    mount()
    const box = await screen.findByRole('checkbox', { name: 'مسئول فعالیت' })
    await userEvent.click(box)
    await waitFor(() => expect(put).not.toBeNull())
    expect(put!.path).toBe('/api/visibility/node_actor')
    expect(put!.body).toEqual({ visible: false })
  })

  it('says the policy is the same for every non-editor', async () => {
    // The one thing an Editor must not misunderstand: this is not a per-role or
    // per-department grant (D16). Pinned as copy, not as a blacklist of words —
    // a blacklist can only forbid the misreadings someone thought of.
    mount()
    expect(await screen.findByText(
      'این تنظیم برای همهٔ کسانی که اجازهٔ ویرایش ندارند یکسان است.',
    )).toBeInTheDocument()
  })

  it('shows the policy version, because it is what a cached report is keyed on', async () => {
    mount()
    expect(await screen.findByText(/0123456789abcdef/)).toBeInTheDocument()
  })
})
```

Create `ui/src/shell/PanelShell.visibility.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PanelShell } from './PanelShell'
import type { SessionDescriptor } from '../auth/session'

const BASE: SessionDescriptor = {
  username: '09120000000', displayName: 'و', role: 'editor',
  capabilities: [], scopes: ['*'], supervisor: null, canSupervise: false,
  pendingApprovals: 0,
}

function mount(session: SessionDescriptor) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><PanelShell session={session} /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the policy entry in the panel header', () => {
  it('is drawn for a holder of set_visibility', () => {
    mount({ ...BASE, capabilities: ['view', 'edit', 'set_visibility'] })
    expect(screen.getByRole('link', { name: 'نمایش محتوا' })).toBeInTheDocument()
  })

  it('is not drawn for a panel user who holds view_audit but not set_visibility', () => {
    // An auditor, deliberately: they reach the panel shell (selectShell counts
    // view_audit) and hold no set_visibility, so a check of "is this a panel
    // user?" would draw them a control the server answers 403 to. A Reader could
    // not tell those two mistakes apart — they never see this shell at all.
    mount({ ...BASE, capabilities: ['view', 'view_audit'] })
    expect(screen.queryByRole('link', { name: 'نمایش محتوا' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd ui && npx vitest run src/screens/Visibility.test.tsx src/shell/PanelShell.visibility.test.tsx`
Expected: FAIL — `Failed to resolve import "./Visibility"`, and no link named «نمایش محتوا».

- [ ] **Step 3: Types and hooks**

Append to `ui/src/api/types.ts`:

```ts
/** The six switchable fields (spec D17). A node has no KPIs: `process_kpis` is
 *  `process.kpis[]`, and what a node carries is ICOM. */
export type PolicyField =
  | 'process_summary' | 'process_idef0' | 'process_kpis'
  | 'node_description' | 'node_actor' | 'node_icom'

/** `version` is a digest of the policy, not a counter: it is what D27 keys the
 *  report cache on, so an artifact built under a different one is a different
 *  artifact. */
export interface VisibilityPolicy {
  fields: Record<PolicyField, boolean>
  version: string
}
```

Append to `ui/src/api/hooks.ts` (adding `PolicyField`, `VisibilityPolicy` to the type import):

```ts
export const useVisibility = (opts?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['visibility'],
    queryFn: () => fetchJson<VisibilityPolicy>('/api/visibility'),
    enabled: opts?.enabled ?? true,
  })

export function useSetVisibilityField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ field, visible }: { field: PolicyField; visible: boolean }) =>
      fetchJson<VisibilityPolicy>(`/api/visibility/${field}`,
        { method: 'PUT', body: JSON.stringify({ visible }) }),
    // Every document body in the app changes with the policy, so the whole cache
    // goes rather than one key: `process`, `processes` and the export URLs are
    // all downstream of it, and an invalidation list would be a list to forget
    // an entry from.
    onSuccess: (data) => {
      qc.setQueryData(['visibility'], data)
      qc.invalidateQueries({ queryKey: ['process'] })
      qc.invalidateQueries({ queryKey: ['processes'] })
    },
  })
}
```

- [ ] **Step 4: Write the screen**

Create `ui/src/screens/Visibility.tsx`:

```tsx
import { useVisibility, useSetVisibilityField } from '../api/hooks'
import { refusalStatus } from '../api/client'
import { RefusalScreen } from './Refusal'
import type { PolicyField } from '../api/types'

/** The six switches, in the order the store lists them: the process's own record
 *  first, then a node's. The labels name what a reader would see, never the
 *  storage key. */
const ROWS: { field: PolicyField; label: string; hint: string }[] = [
  { field: 'process_summary', label: 'خلاصهٔ فرآیند',
    hint: 'متن کوتاهی که کارِ کلی فرآیند را توضیح می‌دهد.' },
  { field: 'process_idef0', label: 'نمای IDEF0 فرآیند',
    hint: 'ورودی‌ها، کنترل‌ها، خروجی‌ها و مکانیزم‌های سطح فرآیند.' },
  { field: 'process_kpis', label: 'شاخص‌های کلیدی فرآیند',
    hint: 'شاخص‌هایی که عملکرد این فرآیند با آن‌ها سنجیده می‌شود.' },
  { field: 'node_description', label: 'توضیح فعالیت',
    hint: 'شرح هر باکس در فلوچارت.' },
  { field: 'node_actor', label: 'مسئول فعالیت',
    hint: 'نقشی که انجام هر فعالیت بر عهدهٔ اوست.' },
  { field: 'node_icom', label: 'ICOM فعالیت',
    hint: 'ورودی‌ها، کنترل‌ها، خروجی‌ها و مکانیزم‌های هر فعالیت.' },
]

/**
 * What every non-editor sees of a process (spec D16, D17, D19).
 *
 * **One global policy.** Not a grant, not per-role, not per-department: what
 * varies between people is which departments and reports they can reach, never
 * which fields. The copy says so in as many words, because an Editor who reads
 * this screen as "hide the actor from *this* department" would be wrong in the
 * direction that publishes something.
 *
 * The department information page is not here (D55): it is shown in its
 * entirety, and there is no policy table for it.
 *
 * Every change is recorded with the actor, the field and both values (D19), and
 * moves the policy version — which is what every cached report is keyed on
 * (D27), so a switch takes effect on already-published documents rather than
 * leaving them serving what it just turned off.
 */
export function Visibility() {
  const { data, error } = useVisibility()
  const set = useSetVisibilityField()

  const refused = refusalStatus(error)
  if (refused) return <RefusalScreen status={refused} />
  if (!data) return <div className="flex-1 bg-bg" />

  return (
    <div className="flex-1 overflow-auto py-s12 px-s12">
      <div className="max-w-list mx-auto">
        <h1 className="text-title font-extrabold text-ink">نمایش محتوا</h1>
        <p className="text-caption text-muted mt-s4">
          این تنظیم برای همهٔ کسانی که اجازهٔ ویرایش ندارند یکسان است.
        </p>
        <p className="text-caption text-faint mt-s2">
          معرفی دپارتمان همیشه به‌طور کامل نمایش داده می‌شود و تنظیمی ندارد.
        </p>

        <div className="flex flex-col gap-s5 mt-s10">
          {ROWS.map(({ field, label, hint }) => (
            <label key={field}
              className="flex items-start gap-s6 bg-card border border-warm rounded-card px-s9 py-s8 shadow-card cursor-pointer">
              <input
                type="checkbox"
                checked={data.fields[field]}
                disabled={set.isPending}
                onChange={(e) => set.mutate({ field, visible: e.target.checked })}
                className="min-h-touch min-w-touch shrink-0 accent-violet"
              />
              <span className="min-w-0">
                <span className="block text-subtitle font-bold text-ink">{label}</span>
                <span className="block text-caption text-muted mt-s2">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        <p className="text-caption text-faint mt-s10 font-mono">
          نسخهٔ تنظیم: {data.version}
        </p>
      </div>
    </div>
  )
}
```

The version line is shown because it is what a cached report is keyed on: an Editor who has just moved a switch and wants to know whether the published documents followed has one string to compare, rather than a promise.

- [ ] **Step 5: Route and nav entry**

In `ui/src/routes.tsx`, import the screen and add the route inside `RequireAuth`'s children, after `/processes/:pid/flow`:

```tsx
      { path: '/visibility', element: <Visibility /> },
```

In `ui/src/shell/PanelShell.tsx`, import `Link` from `react-router-dom` and add, immediately before the inbox block:

```tsx
      {can(session, 'set_visibility') && (
        <Link
          to="/visibility"
          aria-label="نمایش محتوا"
          className="min-h-touch inline-flex items-center px-s6 rounded-control text-card text-caption no-underline hover:bg-tile-v2"
        >
          نمایش محتوا
        </Link>
      )}
```

`can(session, 'set_visibility')` — the capability alone, with no target, exactly as the shell's `canEdit` does. It is cosmetic (D48): the endpoints re-derive the capability *and* the `*` scope and refuse regardless.

- [ ] **Step 6: Verify**

Run: `cd ui && npx vitest run`
Expected: PASS, including `src/test/guards.test.ts` — `PanelShell.tsx` is policed, so a hex colour or a `text-[13px]` in the nav entry fails there rather than in review.

Run: `cd ui && npx tsc -b && npm run lint && npm run build`
Expected: exit 0 each.

- [ ] **Step 7: Prove the nav gate is not vacuous**

Temporarily change the condition to `can(session, 'edit')` and re-run `PanelShell.visibility.test.tsx`. Expected: the auditor case still passes (an auditor holds neither) — so **also** flip the test's second session to `['view', 'edit']` locally and confirm it then fails. Revert both. Report what you found: the fixture pair has to be able to separate the capability it names, and a role pair that could not do exactly that hid three mutants in an earlier sub-project.

- [ ] **Step 8: Commit**

```bash
git add ui/src/screens/Visibility.tsx ui/src/screens/Visibility.test.tsx ui/src/shell ui/src/routes.tsx ui/src/api
git commit -m "feat(ui): the six switches, and what they are not

One global policy, and the copy says so: what varies between people is which
departments they reach, never which fields. An Editor reading this as 'hide the
actor from THIS department' would be wrong in the direction that publishes
something.

The department information page is absent by design (D55) and the screen says
that too, so its absence reads as a decision rather than an omission.

The policy version is on the page because every cached report is keyed on it: an
Editor who has just moved a switch has one string to compare rather than a
promise.

The header entry is drawn on set_visibility alone — an auditor reaches the panel
shell and holds none, and a 'is this a panel user?' check would draw them a
control the server answers 403 to."
```

---

## Self-Review

### 1. Spec coverage

| Decision | Where it lands |
|---|---|
| **D16** — one global policy, guarded by `set_visibility` | Task 4 (the store's docstring and field set), Task 9 (both routes gated on `set_visibility` at `*`; a department-scoped Editor is 404'd), Task 12 (the copy) |
| **D17** — policy fields and defaults; the never-shown block; tombstones excluded | Task 4 (`FIELDS`/`DEFAULTS` pinned as an equality), Task 5 (the blank/drop table and the key-set equality), Task 6 (the body scan's `HIDDEN_FIELD_TOKENS`/`SHOWN_FIELD_TOKENS`), Task 7 (tombstones as whole records, at four boundaries) |
| **D18** — one filter, server-side, on every response | Task 5 (`visibility.filtered`), Task 6 (all seven boundaries delegate), Task 10 (the bundle calls the same function) |
| **D19** — every policy change is audited, with both values | Task 9 (`visibility.policy.changed`; `test_the_event_carries_the_actor_the_field_and_both_values`) |
| **D20** — a confirmation is a fingerprint, not a boolean | Task 1 (the table), Task 2 (the fingerprint), Task 3 (the store), Task 8 (the echo and the 409) |
| **D21** — the canonical form and the four exclusions | Task 2 in full, both directions, plus the end-to-end pair in Task 7 |
| **D22** — unconfirmed content is invisible to non-editors | Task 7 (four boundaries + the derived counts), Task 10 (the bundle publishes only confirmed content) |
| **D23** — the system starts dark | Task 1 (`test_the_system_starts_dark`), Task 7 (`test_a_reader_sees_an_empty_department_until_something_is_confirmed`) |
| **D27** — the fingerprint-keyed cache, including the policy version | Task 4 (`policy.version`), Task 10 (`report_key`, six tests + the end-to-end URL test) |
| **D55** — the overview is shown in full | Task 5 (`public_overview`), Task 6 (equality against an Editor's own body), Task 7 (scope + confirmation are the only two gates), Task 12 (the screen says it has no switches) |
| **D56** — withheld data is never sent | Task 6 (fields), Task 7 (whole records **and** the board's derived counts, 404 not 403), Task 8 (lexical gate, uniform 404), Task 9 (reading the policy needs the capability) |
| **D61** — confirming and un-confirming are both actions | Task 8 (`confirmation.set`/`confirmation.revoked`, both targets, and `test_withdrawing_emits_revoked_and_not_invalidated`) |
| **§11 test 8** — content filter, no denylisted field to a non-editor, over every endpoint | Task 6, over the whole read sweep, for three non-editing roles, paired against an Editor |
| **§11 test 15** — fingerprints; positions must invalidate | Task 2 |
| **§11 test 22** — the report cache key | Task 10 |

**The four handed-down debts:** field-level stripping → **Tasks 5 and 6**. `exports.build_payload`'s cross-department link → **Task 10**. The report cache key's policy version → **Tasks 4 and 10**. `/api/pending` not skipping tombstones → **Task 7**.

**§11 tests 2, 3, 4 and 5 are named in the brief but belong to P0c, not here.** Test 2 is the delegation matrix, test 3 the supervisor candidate list, test 4 `delegable: false` at the data layer, test 5 the `*`-holder invariant — all four are about *user administration*, and none of them has a surface in this sub-project. P1 touches their subject matter at exactly one point and honours it: `set_visibility` and `confirm` are `delegable: false`, and **no route added here creates, edits or deletes a role**, so `seed.NON_DELEGABLE` remains their only origin. Tasks 8 and 9 add capability-gated endpoints and nothing that mints a capability. If the intent was that P1 must not *weaken* those four, that is discharged; if it was that P1 should implement them, they need P0c's user endpoints to exist first and cannot be written against an empty set (test 4 says so itself).

**Deliberately out of scope, named so nobody assumes they were missed:**
- **D27's reuse-on-hit** and **D26's report registry** and **D25's read-versus-download split** — the reports sub-project's. Task 10 lands the key (a correctness property: a cache surviving a policy change is a leak) and leaves the caching (a performance property).
- **`confirmation.invalidated`** (D60) — projected from git by the activity-record sub-project. Task 8 asserts nothing here emits it, which is the half P1 owes.
- **`access.denied` on 403** (D42) — still unwritten, still belongs on `requires`' 403 branch.
- **`ui/src/flow/FlowScreen.tsx`** — off-limits. Its toolbar is still drawn on `tombstoned` alone with no `useCan`, and it still shows a blank page on 403/404. A reader following a link to an *unconfirmed* process's flowchart now hits the same dead end. **This task makes that pre-existing gap easier to reach, and it must be filed against whoever owns that directory.**
- **`relayout`'s raw stderr** — the fix belongs in `engine/`.
- **`GET /exports/{file_path:path}` derives no department scope** — D56's Downloads row, and the other half of the question Task 10 closes. The bundle no longer carries a foreign id, so the remaining exposure is narrower, but it is not gone.

### 2. Placeholder scan

No "TBD", no "similar to Task N", no "add appropriate error handling". Every code step carries its code and every command its expected output. Two steps are the closest thing to an exception and both are deliberate and bounded:

- Task 11, Step 1 names `ui/src/test/render-overview.tsx` as *"copy the arrangement from the current `Overview.test.tsx`"* rather than reproducing it. That file's provider stack is a fact about the repo the plan cannot restate without being wrong the day it changes, and the instruction says exactly which file to copy from and what to do if a helper already exists.
- Task 10, Step 5 says the two new export-API tests should follow *"the pattern of the file's existing 200-expecting export tests"* for their `EXPORT_DIR` arrangement. Same reason: `test_exports_api.py` builds a configured settings object in a way that must not be forked.

### 3. Type consistency

Checked across tasks:

- `fingerprint(doc: dict) -> str` — defined Task 2; called in Tasks 3 (tests), 7, 8, 10, and both test corpora. One name, one signature, always positional.
- `visibility.filtered(doc, *, policy, sees, editor)` — defined Task 5; called in Task 6 (`Disclosure.redact`) and Task 10 (`build_payload`). Keyword-only, identical at both call sites.
- `visibility.public_overview(doc, *, editor)` — defined Task 5; called in Task 6 (`Disclosure.redact_overview`) and Task 10.
- `Disclosure.redact(doc, dept)` — **signature unchanged from P0b**, which is what keeps the six process boundaries untouched. `redact_overview(doc, dept)` and `may_serve(doc, dept, target)` take `dept` in the same position and mean the same thing by it (the document's own department, derived from the request path).
- `Disclosure.servable(docs, dept) -> list[dict]` — Task 7; called in `list_processes` and `list_departments`. Never `visible_records`, never `serve_only`.
- `store.confirmations.set_confirmation(conn, *, target, fingerprint, by, at)` — Task 3; called in Tasks 7 (test fixture), 8 (router), 10 (test helper). Note the module is `confirmations` and the setter is `set_confirmation`, not `set`, so `confirmations.set` never appears.
- `store.policy.current(conn)` / `set_field(conn, field, visible)` / `version(conn)` / `FIELDS` / `DEFAULTS` — Task 4; used in Tasks 5 (tests), 6, 9, 10, 12 (the TS mirror).
- `exports.report_key(signing_key, code, kind, *, process_fingerprints, overview_fingerprint, policy_version)` — Task 10; three positional then three keyword-only, identically in the router and in all six key tests. `export_token` is deleted, and its two tests go with it.
- `exports.Unconfirmed` subclasses `ExportUnavailable`, and Task 10 Step 4 states the except-order dependency that follows.
- Frontend: `Confirmation` (Task 11) and `VisibilityPolicy`/`PolicyField` (Task 12) are the only new types; `useConfirmations(code, opts)`, `useSetConfirmation(code)`, `useRevokeConfirmation(code)`, `useVisibility(opts)`, `useSetVisibilityField()` are named identically in the hooks file, in `ConfirmMark`, and in all three screens. `<ConfirmMark row department />` takes the same two props at its three placements.
- `policy.FIELDS` and TypeScript's `PolicyField` are the same six strings in the same order. **If a seventh switch is ever added, both change or the screen silently omits it** — the backend's `test_the_defaults_are_exactly_d17s_table` fails on the count, which is the alarm.

### 4. One risk worth stating plainly

**Task 7 is the task that can quietly break every other test in the repo's most load-bearing file.** The moment the confirmation gate lands, every scoped non-editor in `test_body_scan.py` starts receiving empty bodies — and an empty body satisfies every leak assertion in that file. Step 5 of that task confirms the corpus and adds `test_a_reader_is_served_the_confirmed_processes` as the alarm. If those two are skipped, the suite goes green and the whole of P0b's leak coverage stops testing anything. Do not reorder that task's steps.
