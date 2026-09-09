# Quantitative facts v3.8 — review never dropped — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A facts run applies every review decision that passes and holds back the rest by decision; a stale review is redone; a too-big digest stops the run; caps are gone; retry errors carry their specifics.

**Architecture:** All behaviour lives in `engine/facts_plan/assemble.py` (fold, validate, digest, report) with one line in `merge_facts/content.py` and one schema edit; the data-repo playbook and agent text follow the engine; docs last.

**Tech Stack:** Python 3 engine (`pip install -e engine`, pytest under `.venv`), JSON Schema 2020-12, Markdown playbooks linted by `data-repo/.claude/hooks/test_playbook_lint.py`.

**Spec:** `docs/superpowers/specs/2026-09-09-quantitative-facts-v3-review-never-dropped-design.md` (rules R1–R9).

## Global Constraints

- Owner-facing text (report lines, playbook Persian blocks) carries **no** id (`F-`, `T-`, `S-`, `u-`), path, code (`#`/`##`), unit id or command — the report is a Telegram message.
- The engine stays deterministic: ascending unit id, ascending skeleton id, decision order as written; no wall-clock, no randomness.
- `discarded` no longer exists as a `review_status`; the three values are `applied`, `partial`, `absent`.
- Tests are run scoped: `.venv/bin/pytest -q -k "<expr>" engine/tests` from the worktree root; the whole engine suite once at the end of Task 3 (`.venv/bin/pytest -q engine/tests`).
- Hooks tests: `<code worktree>/.venv/bin/pytest -q <data worktree>/.claude/hooks`.
- Commit on the current branch (`facts-v3-gate`) in each repo; never push; never touch `main`.
- Code worktree: `code-repo/.claude/worktrees/facts-v3-gate`. Data worktree: `process dev/data-repo.facts-v3-gate`.
- Pinned sentences the hooks tests already assert on stay verbatim (see Task 4).

---

### Task 1: Concrete errors, `code` admitted and stripped, caps gone, ceiling a stop (R4, R5, R6, R7)

**Files:**
- Modify: `engine/merge_facts/content.py` (`group_messages`)
- Modify: `schemas/facts-unit.schema.json` (`decisionData`, top-level `if/then/else`)
- Modify: `engine/facts_plan/assemble.py` (`REVIEW_DECISIONS`/`REVIEW_REWRITES`, `_review_caps`, `validate_unit`, `_digest_text`, `_collect`, `_fold_review`, `DIGEST_CEILING`, `digest`)
- Test: `engine/tests/test_validate_facts_content.py`, `engine/tests/test_facts_plan_assemble.py`

**Interfaces:**
- Produces: `DIGEST_CEILING == 400_000`; `digest()` raises `SystemExit(2)` above it and writes nothing; `group_messages` line = first body verbatim + ` — N entries: …`; a decision's `data.code` is dropped at read time in `_collect` and in `_fold_review`.

- [ ] **Step 1: Failing tests**

In `engine/tests/test_validate_facts_content.py`, after `test_group_messages_folds_one_rule_into_one_line`:

```python
def test_group_messages_keeps_the_first_message_s_specifics():
    """The accounting review of 2026-09-09 was retried against
    "primaryKey member … is not a declared field" — the name elided — and
    failed the same way twice. The group key still folds the quotes; the
    printed line carries the first body as written."""
    lines = group_messages([
        "review: primaryKey member 'tarikh' is not a declared field",
        "u-a: primaryKey member 'sal' is not a declared field"])
    assert lines == ["primaryKey member 'tarikh' is not a declared field "
                     "— 2 entries: review, u-a"]
```

In `engine/tests/test_facts_plan_assemble.py` (uses the existing helpers `_root`, `_run`, `_record_out`, `_rule_out`, `_write_review`, `digest`, `assemble`, `validate_unit`):

```python
def test_a_review_of_any_size_is_accepted(tmp_path):
    """R6: 61 decisions and 21 rewrites were a refusal of the whole document."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    keep = {"entry": {"kind": "rule", "key": "enheraf"}, "action": "keep",
            "key": "enheraf", "title": "انحراف مصرف",
            "statement": "انحراف مصرف برابر است با مصرف واقعی منهای مصرف اعلامی."}
    _write_review(run_dir, [dict(keep) for _ in range(61)])
    problems = validate_unit(root, run_dir, run_dir / "review" / "out.json")
    assert not any("at most" in p for p in problems)


def test_a_code_a_decision_writes_is_ignored(tmp_path):
    """R4: the cooking review of 2026-09-08 was refused whole for copying the
    engine-owned `code` back in. It passes now and changes nothing."""
    root = _root(tmp_path)
    record = _record_out()
    record["decisions"][0]["data"]["code"] = "##99"
    run_dir = _run(root, {"u-a": record, "u-b": _rule_out()})
    assert validate_unit(root, run_dir, run_dir / "units" / "u-a" / "out.1.json") == []
    assemble(root, run_dir)
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    rec = next(e for e in delta["entries"] if e["key"] == "gozaresh_shabane_pitza")
    assert rec["data"].get("code") != "##99"


def test_a_digest_over_the_ceiling_stops_the_run(tmp_path, monkeypatch):
    """R7: over the ceiling is a defect that stops, not a run without review."""
    import facts_plan.assemble as A
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    monkeypatch.setattr(A, "DIGEST_CEILING", 10)
    with pytest.raises(SystemExit) as exc:
        digest(root, run_dir)
    assert exc.value.code == 2
    assert not (run_dir / "review" / "input.md").exists()
    assert not (run_dir / "review" / "input.sha256").exists()
```

Also search the test suite for the two cap tests and the header assertion and adjust them:

```
grep -n "at most 60\|at most 20\|decisions ≤\|REVIEW_DECISIONS\|REVIEW_REWRITES\|proceeds without a review" engine/tests/*.py
```
Every such assertion is deleted or inverted (a 61-decision document now passes; the digest header line is gone).

- [ ] **Step 2: Run, expect failures**

`.venv/bin/pytest -q -k "group_messages or any_size or code_a_decision or over_the_ceiling" engine/tests`

- [ ] **Step 3: Implement**

`engine/merge_facts/content.py`, `group_messages`: keep the folded key, remember the first body:

```python
    groups = {}
    for msg in messages:
        label, sep, body = msg.partition(": ")
        if not sep:
            label, body = "", msg
        groups.setdefault(_QUOTED_RE.sub("…", body), (body, []))[1].append(label)
    out = []
    for _rule, (first, labels) in groups.items():
        shown = ", ".join(labels[:GROUP_IDS_SHOWN])
        tail = " …" if len(labels) > GROUP_IDS_SHOWN else ""
        out.append(f"{first} — {len(labels)} entries: {shown}{tail}")
    return out
```
Update the docstring: the fold is the group key, the first body is what is printed (a retry needs the specifics).

`schemas/facts-unit.schema.json`: add `"code": { "$ref": "#/$defs/leaf" }` to `$defs.decisionData.properties`; replace the top-level `"if"/"then"/"else"` so that only the `else` rule survives — i.e. keep the `if` on `unit == "review"`, delete the `then` (`maxItems: 60`), keep the `else` that forbids `contradiction` outside a review. Run `make test` (schema check) afterwards.

`engine/facts_plan/assemble.py`:
- delete `REVIEW_DECISIONS, REVIEW_REWRITES = 60, 20` and `_review_caps`; in `validate_unit` drop the `caps` computation and the `checked = …` trim (validate `doc` directly); `problems, seen, unit = [], [], None`.
- `_digest_text`: header becomes `["# digest", "", "## entries", ""]`.
- `_collect`: where each unit decision is stored into `state["by_skeleton"]`, strip: `data = decision.get("data"); if isinstance(data, dict): data.pop("code", None)` (do it on the copy `dict(decision, …)` that is stored — never mutate the file's document in place if it is reused elsewhere; a deep copy of `data` is fine).
- `_fold_review`: same strip on `decision["data"]` before the member merge.
- `DIGEST_CEILING = 400000` with the comment: the runtime model holds 1 M; cooking digests to ~29 K; above the ceiling the run stops (R7).
- `digest`: replace the `print(...); return path` branch with `print(f"facts-plan: digest is {tokens} tokens, over the {DIGEST_CEILING} ceiling — the assembled result must be reviewed in slices, which this engine cannot yet do; the run stops here", file=sys.stderr); raise SystemExit(2)`.
- Update the docstrings that mention the caps or "proceeds without a review".

- [ ] **Step 4: Run, expect pass**

`.venv/bin/pytest -q -k "group_messages or any_size or code_a_decision or over_the_ceiling or digest or review" engine/tests` and `make test`.

- [ ] **Step 5: Commit**

```bash
git add engine/merge_facts/content.py schemas/facts-unit.schema.json engine/facts_plan/assemble.py engine/tests/test_validate_facts_content.py engine/tests/test_facts_plan_assemble.py
git commit -m "feat(facts): review caps gone, code ignored not refused, the ceiling stops the run, grouped errors keep their specifics"
```

---

### Task 2: The fold — per-decision hold-back, stale review stops, `review_held`, statuses (R1, R2, R3, R8)

**Files:**
- Modify: `engine/facts_plan/assemble.py` (`_review_problems`, `_fold_review`, `_prepare`, `assemble`, `validate_unit`)
- Test: `engine/tests/test_facts_plan_assemble.py`

**Interfaces:**
- Consumes: Task 1's `code` strip in `_fold_review`.
- Produces: `_review_verdicts(run_dir, doc, state, draft, scratch) -> (stale: bool, held: dict[int, tuple[str, str]])` (index → `(reason_code, line)`); `_review_problems(...)` stays and returns the same lines as today plus the `fields_rewrite` line, plus «out.json: the digest changed since this review was written» when stale; `_fold_review(run_dir, state, draft, scratch, exclude=frozenset(), held=None) -> "applied" | "partial" | "absent"`, raising `SystemExit(2)` when stale; `_prepare(root, run_dir, review, exclude=frozenset(), held=None)`; `state["review_held"]` list of `{n, action, label, reason, lines}`; `state["reviewed_by"]: {skeleton: [n, …]}`; `assembly.json` carries `review_held`.

Reason codes and Persian words (used by Task 3):

```python
REVIEW_HELD_FA = {
    "no_match": "نشانی به هیچ موردی نمی‌رسید",
    "ambiguous": "نشانی به بیش از یک مورد می‌رسید",
    "no_drift": "تناقض روی میدانی بود که پرچم اختلاف نداشت",
    "unknown_skeleton": "نامزدی که نام برده شد در این اجرا نبود",
    "fields_rewrite": "بازنویسی ستون‌های جدول از بازبینی پذیرفته نمی‌شود",
    "refused": "نتیجهٔ بازنویسی با قرارداد ثبت جور در نیامد",
}
```

- [ ] **Step 1: Failing tests**

Rewrite these existing tests in `engine/tests/test_facts_plan_assemble.py`:

`test_digest_then_a_stale_review_is_discarded` → rename `test_a_stale_review_stops_the_assembly`; its last two lines become:

```python
    (run_dir / "review" / "input.sha256").write_text("0" * 64, encoding="utf-8")
    (run_dir / "facts-delta.json").unlink()
    with pytest.raises(SystemExit) as exc:
        assemble(root, run_dir, review=True)
    assert exc.value.code == 2
    assert not (run_dir / "facts-delta.json").exists()
    assert "the digest changed since this review was written" in " ".join(
        validate_unit(root, run_dir, run_dir / "review" / "out.json"))
```

`test_a_review_address_hitting_nothing_discards_the_document` → rename `..._is_held_back_on_its_own`; write two decisions (the bad `enheraf` address with `branches: []` **and** the good scope-less one titled «انحراف دیگر» from the next test), then:

```python
    assert assemble(root, run_dir, review=True)["review_status"] == "partial"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    assert next(e for e in delta["entries"] if e["key"] == "enheraf")["title"] == "انحراف دیگر"
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [(r["n"], r["reason"]) for r in assembly["review_held"]] == [(0, "no_match")]
    assert assembly["review_held"][0]["label"] == "rule enheraf"
```

`test_contradiction_on_a_field_with_no_drift_discards_the_review` → `..._is_held_back`: status `partial`, `review_held == [{"n": 0, "action": "contradiction", "label": "…the tol entry's title…", "reason": "no_drift", "lines": [...]}]` (assert `n`, `action`, `reason`), value still 6.

`test_the_review_gate_refuses_what_the_fold_would_discard`: keep the two expected lines (they are still what the validator prints); the docstring's "discard the whole document" becomes "hold back".

New tests:

```python
def test_a_keep_the_contract_refuses_is_held_back_and_the_unit_s_version_kept(tmp_path):
    """R2: the cooking review lost 22 decisions to sixteen items the fold could
    not store. The decision that fails the lint is held back; the rest apply."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [
        {"entry": {"kind": "rule", "key": "enheraf"}, "action": "keep",
         "key": "enheraf", "title": "انحراف مصرف",
         "statement": "انحراف مصرف برابر است با J6."},          # a cell reference: the lint refuses it
        {"entry": {"kind": "record", "key": "gozaresh_shabane_pitza"}, "action": "keep",
         "key": "gozaresh_shabane_pitza", "title": "گزارش شبانهٔ پیتزا",
         "statement": "جدولی که سرلاین پیتزا هر شب پر می‌کند."}])
    assert assemble(root, run_dir, review=True)["review_status"] == "partial"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    by_key = {e["key"]: e for e in delta["entries"]}
    assert by_key["enheraf"]["statement"].endswith("اعلامی لاین.")   # the unit's
    assert by_key["gozaresh_shabane_pitza"]["title"] == "گزارش شبانهٔ پیتزا"
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert [(r["n"], r["reason"]) for r in assembly["review_held"]] == [(0, "refused")]
    assert assembly["review_held"][0]["label"] == "انحراف مصرف"
    assert assembly["review_held"][0]["lines"]


def test_a_fields_rewrite_from_the_review_is_held_back(tmp_path):
    """R1 `fields_rewrite`: the accounting review of 2026-09-09."""
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [
        {"entry": {"kind": "record", "key": "gozaresh_shabane_pitza"}, "action": "keep",
         "key": "gozaresh_shabane_pitza", "title": "گزارش شبانهٔ پیتزا",
         "statement": "جدولی که سرلاین پیتزا هر شب پر می‌کند.",
         "data": {"fields": [{"from": "masraf_elami", "unit": "kg"}]}}])
    lines = validate_unit(root, run_dir, run_dir / "review" / "out.json")
    assert lines == ["decisions[0]: fields: a review does not rewrite a record's "
                     "fields (the digest shows minted keys, not column keys)"]
    assert assemble(root, run_dir, review=True)["review_status"] == "partial"
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert assembly["review_held"][0]["reason"] == "fields_rewrite"
    delta = json.loads((run_dir / "facts-delta.json").read_text(encoding="utf-8"))
    rec = next(e for e in delta["entries"] if e["key"] == "gozaresh_shabane_pitza")
    assert rec["title"] == "گزارش شبانهٔ لاین پیتزا"          # the unit's title, untouched


def test_a_review_with_nothing_held_is_applied_and_review_held_is_empty(tmp_path):
    root = _root(tmp_path)
    run_dir = _run(root, {"u-a": _record_out(), "u-b": _rule_out()})
    digest(root, run_dir)
    _write_review(run_dir, [{"entry": {"kind": "rule", "key": "enheraf"}, "action": "keep",
                             "key": "enheraf", "title": "انحراف دیگر",
                             "statement": "انحراف مصرف اعلامی است."}])
    assert assemble(root, run_dir, review=True)["review_status"] == "applied"
    assembly = json.loads((run_dir / "assembly.json").read_text(encoding="utf-8"))
    assert assembly["review_held"] == []
```

Check the statement «انحراف مصرف برابر است با J6.» really fails the §5.2 lint (an A1 cell reference in prose — see `_lint_decision`); if the lint exempts it in a rule, use another refusal the store contract raises (e.g. a `keep` with `data: {"lang": "feel", "expr": "x = y"}` naming an undeclared identifier) and adjust the assertion on the unit's statement accordingly.

Also grep the suite for `"discarded"` and `review_status` and fix every remaining reference (`test_facts_plan_report.py` is Task 3's).

- [ ] **Step 2: Run, expect failures**

`.venv/bin/pytest -q -k "review or stale or held_back or contradiction" engine/tests`

- [ ] **Step 3: Implement**

In `assemble.py`:

1. `_review_verdicts(run_dir, doc, state, draft, scratch)` — the body of today's `_review_problems` restructured: returns `(stale, held)` where `held` maps a decision index to `(reason_code, line)`. Reason per case: address hits 0 → `no_match`, >1 → `ambiguous` (both for `entry` and `into`), contradiction without a matching drift flag → `no_drift`, unknown skeleton → `unknown_skeleton`, `action == "keep"` with `isinstance(decision.get("data"), dict) and "fields" in decision["data"]` → `fields_rewrite` with the line `decisions[{n}]: fields: a review does not rewrite a record's fields (the digest shows minted keys, not column keys)`. Lines keep today's exact wording for the existing cases.

2. `_review_problems(...)` becomes: `stale, held = _review_verdicts(...)`; return `(["out.json: the digest changed since this review was written"] if stale else []) + [line for _n, (_code, line) in sorted(held.items())]`.

3. `_fold_review(run_dir, state, draft, scratch, exclude=frozenset(), held=None)`:
   - no `out.json` → `"absent"` (also when `input.sha256` is missing).
   - `stale, verdicts = _review_verdicts(...)`; if stale: `print("facts-plan: review: the digest changed since this review was written — run digest and the review again", file=sys.stderr); raise SystemExit(2)`.
   - `skip = set(verdicts) | set(exclude)`; fold every decision whose index is not in `skip` exactly as today (strip `code`, member-merge, `settled`, `reviewed`), and additionally build `state["reviewed_by"]`: for a folded keep/merge_into/split → `reviewed_by[skeleton].append(n)`; for a settled contradiction → `reviewed_by[hit["_skeleton"]].append(n)`.
   - `state["review_held"]` = one row per index in `skip`, ordered by `n`: `{"n": n, "action": decision.get("action"), "label": _held_label(decision, hits, state), "reason": code, "lines": [line]}` where the code/line come from `verdicts[n]` or from `held[n]` (Task 2's outer loop passes `held` for `refused` rows: `{n: ("refused", [lines])}`). `_held_label`: the addressed entry's `title` when the address hits exactly one entry (`entry` or `into` resolved), the candidate's label from `state["candidates"]`/`label_of` for a `skeleton` address, else `f'{kind} {key}'` from the address.
   - return `"partial"` if `skip` else `"applied"`.

4. `_prepare(root, run_dir, review, exclude=frozenset(), held=None)` passes both through to `_fold_review`.

5. `assemble`: wrap today's body from `_prepare` through the lint loop in an outer loop:

```python
    exclude, held_rows = set(), {}
    for _outer in range(10_000):
        run_dir, skeleton, state = _prepare(root, run_dir, review, exclude, held_rows)
        entries = _build_entries(root, skeleton, state)
        _cross_unit(root, entries, state)
        _settle(entries, state)
        symbols, reviewed = skeleton.get("unit_symbols") or [], state.get("reviewed") or ()
        retry = False
        for _round in range(len(entries) + 1):
            problems = _lint_entries(root, entries, symbols, reviewed)
            if not problems:
                break
            review_lines = [l for l in problems if l.startswith("review: ")]
            if review_lines:
                by_key = {e["key"]: e for e in entries if e["_skeleton"] in reviewed}
                for line in review_lines:
                    key = line[len("review: "):].split(": ", 1)[0]
                    entry = by_key.get(key)
                    for n in (state["reviewed_by"].get(entry["_skeleton"]) if entry else []) or []:
                        held_rows.setdefault(n, ("refused", []))[1].append(line)
                        exclude.add(n)
                retry = True
                break
            … today's unit hold-back branch, unchanged (the `any(line.startswith("review: ") …)` refusal is gone) …
        if not retry:
            break
```
   If a `review:` line maps to no decision (defensive), print it and `raise SystemExit(2)` as today.
   Write `"review_held": state.get("review_held") or []` into `assembly.json` and return it in the summary dict (`"review_held": len(...)`).

6. `validate_unit` review branch: `_review_problems` is unchanged in role; the fold-lint part uses `_prepare(root, run_dir, True)` and now accepts `review_status in ("applied", "partial")`; wrap that `_prepare` in `try/except SystemExit` → the stale line is already in `problems`, so on `SystemExit` just skip the lint. The `_settle` call and `review:` filter stay.

7. Docstrings: `_fold_review` (§10 "one round, no negotiation" → R1/R2), `assemble`'s "A review's own rewrite is refused outright" comment → held back by decision.

- [ ] **Step 4: Run, expect pass**

`.venv/bin/pytest -q -k "review or stale or held_back or contradiction or digest or assemble" engine/tests`

- [ ] **Step 5: Commit**

```bash
git add engine/facts_plan/assemble.py engine/tests/test_facts_plan_assemble.py
git commit -m "feat(facts): the review is never dropped — a decision that fails is held back on its own, a stale review stops the assembly"
```

---

### Task 3: The report names what the review did (R9)

**Files:**
- Modify: `engine/facts_plan/assemble.py` (`REVIEW_HELD_FA` near `UNDECIDED_FA`, `report`)
- Test: `engine/tests/test_facts_plan_report.py`

**Interfaces:**
- Consumes: `assembly["review_status"] in {"applied", "partial", "absent"}`, `assembly["review_held"]` rows from Task 2.

- [ ] **Step 1: Failing tests**

In `test_facts_plan_report.py`, change the fixture's `"review_status": "discarded"` to `"review_status": "partial"` and add `"review_held": [{"n": 0, "action": "keep", "label": "انحراف مصرف", "reason": "refused", "lines": ["review: enheraf: statement: a cell reference"]}, {"n": 2, "action": "merge_into", "label": "rule masraf", "reason": "no_match", "lines": ["decisions[2]: into: rule masraf names 0 assembled entries"]}]`. Then:

```python
def test_the_report_names_each_held_review_decision_in_persian(tmp_path):
    root = _root(tmp_path)
    run_dir = _fixture_run(root)          # whatever helper the file uses to build a run with assembly.json
    text = report(root, run_dir).read_text(encoding="utf-8")
    assert "بازبینی انجام شد؛ ۲ تصمیم آن کنار گذاشته شد:" in text
    assert "  • «انحراف مصرف» — نتیجهٔ بازنویسی با قرارداد ثبت جور در نیامد" in text
    assert "  • «rule masraf» — نشانی به هیچ موردی نمی‌رسید" in text
    assert "بازبینی اجرا نشد" not in text
    assert not re.search(r"\b[FTS]-\d|\bu-[a-z]|/|##|decisions\[", text)
```
(Read the file first and adapt the helper names; the assertions are the contract.) Adjust any existing assertion on «بدون آن ثبت شد».

- [ ] **Step 2: Run, expect failure**

`.venv/bin/pytest -q -k "report" engine/tests`

- [ ] **Step 3: Implement**

Add `REVIEW_HELD_FA` (the table in Task 2). In `report`, replace the three-way dict line with:

```python
    held = assembly.get("review_held") or []
    status = assembly["review_status"]
    if status == "partial" and held:
        out.append(f"بازبینی انجام شد؛ {_fa(len(held))} تصمیم آن کنار گذاشته شد:")
        out += [f'  • «{row["label"]}» — {REVIEW_HELD_FA.get(row["reason"], REVIEW_HELD_FA["refused"])}'
                for row in held]
    else:
        out.append({"applied": "بازبینی انجام شد.", "partial": "بازبینی انجام شد.",
                    "absent": "بازبینی اجرا نشد."}[status])
```

- [ ] **Step 4: Run the whole engine suite**

`.venv/bin/pytest -q engine/tests` and `make test`.

- [ ] **Step 5: Commit**

```bash
git add engine/facts_plan/assemble.py engine/tests/test_facts_plan_report.py
git commit -m "feat(facts): the report names each review decision that was held back, in the owner's words"
```

---

### Task 4: The playbook and the agent follow the engine (data-repo)

**Files:**
- Modify: `.claude/skills/quantify/SKILL.md` (Stage R, Stage V, Stage 7, Key invariants)
- Modify: `.claude/agents/quantify.md` (`review` mode section)
- Modify: `.claude/hooks/test_playbook_lint.py`
- Modify: `CLAUDE.md` (the `quantify` skill row, if it says "one review" with a cap or "without")

Work in the **data worktree**; tests run with the code worktree's venv: `<code worktree>/.venv/bin/pytest -q <data worktree>/.claude/hooks`.

**Pinned sentences that must stay verbatim** (the hooks tests assert them):
- "A `contradiction` is admissible only on a field the digest lists under its drift flags; two entries you believe disagree on any other field are a `keep` carrying the reason, never a `contradiction`."
- "A `keep` carrying `data` changes only the members it lists — the unit's other members stay as written — and never writes `code`, which the engine owns."

- [ ] **Step 1: Failing hooks tests**

Add to `test_playbook_lint.py`, next to the other `agent_section` tests (find how the file reaches `SKILL.md` — a `SKILL`/`PLAYBOOK` constant or `ROOT / ".claude" / "skills" / "quantify" / "SKILL.md"`):

```python
def test_review_mode_has_no_cap_and_holds_back_by_decision():
    """Owner ruling 2026-09-09: both real runs lost their review whole."""
    assert (
        "There is no cap on decisions or rewrites. A decision whose address matches"
        " zero entries, or more than one, is held back on its own and named in the"
        " report; the rest of your review is applied."
    ) in agent_section("`review` mode")
    assert (
        "A record's `fields[]` is not yours to rewrite — the digest does not show the"
        " column keys the shape needs — and a `keep` carrying `fields` is held back."
    ) in agent_section("`review` mode")


def test_the_playbook_never_proceeds_without_the_review():
    text = SKILL.read_text(encoding="utf-8")
    assert "proceed **without** the review" not in text
    assert "proceed without it" not in text
    assert "The review is never dropped" in text
```

- [ ] **Step 2: Run, expect failures**

- [ ] **Step 3: Edit the texts**

`SKILL.md` Stage R — replace the paragraph after the validate command with:

```
On failure, re-dispatch once with the validator's lines appended — they name the decision and the
member. On a second failure, continue to Stage V anyway: `assemble --review` applies every decision
that passes and holds back the rest **by decision**, and the report names each one. The review is
never dropped — owner ruling, 2026-09-09. If `digest` exits 2, the assembled result is over the
engine's ceiling: stop the run and send

```persian
نتیجهٔ این اجرا بزرگ‌تر از آن است که یکجا بازبینی شود. این یک نقص فنی است و باید برطرف شود؛ هیچ‌چیز ثبت نشد.
```
```
(Keep the playbook's own conventions for Persian blocks — look at how neighbouring stages fence them so the lint's owner-facing check finds it.)

`SKILL.md` Stage V — `--review` always: delete "(Drop `--review` when the review did not run.)"; in the per-entry-error paragraph delete "the reviewer's caps" from the list; the residual-error paragraph ends: "…re-dispatch it with the error, then **re-enter Stage R** (the assembly changed, so the review is stale: digest, review, validate) and re-run Stage V. `assemble --review` exits 2 naming a stale review for the same reason — re-enter Stage R. Never proceed without the review. If Stage V fails again, stop **before** the apply and relay the grouped errors in Persian."

`SKILL.md` Stage 7: "…any workbook skipped or part left unfinished, and what the review changed and what of it was set aside."

`SKILL.md` Key invariants: add "- The review is never dropped: what passes is applied, what fails is held back by decision and named in the report; a stale review is redone."

`quantify.md` `review` mode: replace the "**At most 60 decisions…**" paragraph with:

```
There is no cap on decisions or rewrites. A decision whose address matches zero entries, or more
than one, is held back on its own and named in the report; the rest of your review is applied.
A record's `fields[]` is not yours to rewrite — the digest does not show the column keys the shape
needs — and a `keep` carrying `fields` is held back. A `code` you write is ignored. A `keep`
naming a dropped candidate's skeleton id reinstates it.
```
and reword "Spend the budget on:" → "Spend your attention on:". Also fix "one addressed by `skeleton` discards the whole review" → "one addressed by `skeleton` is held back".

`CLAUDE.md`: read the `quantify` and `quantify.md` rows; if either says the review is capped or may be skipped, correct it in one clause.

- [ ] **Step 4: Run the hooks tests, expect pass**

- [ ] **Step 5: Commit (data worktree)**

```bash
git add .claude/skills/quantify/SKILL.md .claude/agents/quantify.md .claude/hooks/test_playbook_lint.py CLAUDE.md
git commit -m "docs(quantify): the review is never dropped — no caps, hold-back by decision, a stale review is redone, a too-big digest stops the run"
```

---

### Task 5: Docs (code-repo)

**Files:**
- Modify: `docs/decisions/0017-facts-pipeline-v3.md` (append a ruling; mark the ⚠️ caps bullet superseded)
- Modify: `docs/runbooks/07-facts.md` (the refusal table row "`assemble` — the review's own rewrite fails the lint"; any "without the review")
- Modify: `docs/guides/quantitative-facts-walkthrough.md` (Stage R paragraphs, Stage V step 2, the report's closing line)

- [ ] **Step 1: Edit**

ADR — append:

```
**Owner ruling, 2026-09-09 — the review is never dropped (v3.8).** Both real runs lost their
review whole (cooking: a `code` the schema refused; accounting: a `fields[]` rewrite the digest
cannot support, retried against an error with its names elided). Now `assemble --review` applies
every decision that passes and holds back the rest by decision (`assembly.json` `review_held`,
named in the report in Persian); a stale review makes `assemble` exit 2 and the playbook re-enters
Stage R; `code` in a decision is ignored; the two caps are gone; the digest ceiling is 400 K by the
engine's estimator and above it `digest` exits 2 — a defect that stops the run, never a run without
review; grouped validator lines carry the first message's specifics. `review_status` is `applied`,
`partial` or `absent`; `discarded` is gone. Spec:
`docs/superpowers/specs/2026-09-09-quantitative-facts-v3-review-never-dropped-design.md`.
```
and change the ⚠️ bullet "One review round, capped at 60 decisions and 20 rewrites." to "(superseded 2026-09-09, see below) …".

Runbook 07 — the table row becomes: "| `assemble` — a review decision fails the lint or an address lands nowhere | that decision is held back (`review_held`) and named in the report; the rest of the review applies |". Grep the file for "without the review", "discarded", "50 K", "60 decisions" and fix each.

Walkthrough — Stage R: replace the two sentences about the 50 000 ceiling and the "discarded whole — one round, no negotiation … proceeds without it" passage with the new rules (ceiling 400 K, a stop; per-decision hold-back with the six reasons; retry once with concrete errors; stale review redone). Stage V step 2: "It folds the review, holding back by decision what fails (`review_held`), or records it as `absent` when there is none." Report paragraph: the closing line is «بازبینی انجام شد.» or «بازبینی انجام شد؛ … تصمیم آن کنار گذاشته شد:» with one line per held decision. Remove "Caps: 60 decisions, 20 statement rewrites."

- [ ] **Step 2: Check nothing stale is left**

```
grep -rn "discarded whole\|proceeds without\|without the review\|60 decisions\|20 rewrites\|50 000\|50 K\|review_status: discarded" docs/ engine/ schemas/ | grep -v "superpowers/specs/2026-09-06"
```
Only the frozen v3 spec and the new spec's "why" table may mention the old rules.

- [ ] **Step 3: Commit**

```bash
git add docs/decisions/0017-facts-pipeline-v3.md docs/runbooks/07-facts.md docs/guides/quantitative-facts-walkthrough.md
git commit -m "docs(facts): v3.8 — the review is never dropped"
```
