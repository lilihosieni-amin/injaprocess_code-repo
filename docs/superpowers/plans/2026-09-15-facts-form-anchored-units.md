# Facts Form-Anchored Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A facts run decides the forms first, with the meeting passages about each form beside it, and then reads the transcripts knowing what the forms already recorded — so speech annotates forms instead of duplicating or contradicting them.

**Architecture:** The planner (`engine/facts_plan/build.py`) gives every unit a `phase` (1 = workbook/attachment/items, 2 = transcript), appends a deterministic «گفت‌وگوهای مرتبط» section of ranked transcript windows to phase-1 inputs after the core fit check, and renders phase-2 inputs with an «آنچه تا کنون ثبت شده» slice of the gated phase-1 result. `facts-plan status` (`engine/facts_plan/cli.py`) holds phase-2 units `waiting` until phase 1 is over and renders their inputs then. The assembly (`engine/facts_plan/assemble.py`) admits accounts a unit writes with a `voice` source, resolves phase-1 handles from phase-2 documents, and tells the reviewer each entry's source kinds. The agent text and playbook describe the two sections and the two rules.

**Tech Stack:** Python 3.12 engine (`engine/`, pytest), JSON schemas (`schemas/`), data-repo Markdown playbook + agent text with a pytest lint (`.claude/hooks/test_playbook_lint.py`).

**Spec:** `docs/superpowers/specs/2026-09-15-facts-form-anchored-units-design.md` (approved direction 2026-09-15; §4 numbers set by the owner: core 50K).

## Global Constraints

- **Budgets (spec §4):** `IN_BUDGET = 50000` (core input: candidates + text + cards), `OUT_BUDGET = 20000` unchanged and binding, `MAX_LINES = 4500`, `MAX_LINE = 1900` unchanged, `TALK_BUDGET = 80000` (phase-1 related talk, appended **after** the fit check), `RECORDED_BUDGET = 20000` (phase-2 slice). Transcript chunk budget `42000` (leaves the cards' room under 50K; 0.4 × ≈47K core ≈ 19K estimated output).
- **The engine selects, the model never searches** (spec §2.2): a unit reads only its `input.md`. Selection is deterministic: same inputs → byte-identical `input.md`.
- **Nothing spoken is skipped** (§2.3): every chosen transcript line is still read by exactly one phase-2 unit; the plan invariant of 2026-09-13 (F4) stays.
- **Tiers stand** (§2.5): no gate rule changes tier. The one new admission — a unit-written `account` with a `voice` source — is REPAIR-dropped when malformed, exactly as A7 drops engine-owned members today.
- **INV-1/INV-3:** no id minted outside `allocate-id`; an account's `source.ref` must be one of the run's chosen transcripts (`plan.json` `hashes`), never a path the unit invented.
- **Persian for anything a person reads** (headings, the report); English only in logs, stderr and validator lines. Section headings verbatim: `## گفت‌وگوهای مرتبط`, `## آنچه تا کنون ثبت شده`.
- **Git:** each track commits only its own files, by path (`git commit -- <paths>`), on its own branch; never `git add -A`; never push; never touch `main` of either repo; never the server; never the data-repo's `facts/`, `runs/`, `meetings/`, `departments/`, `attachments/`.
- **Tests:** scoped while iterating, the track's full suite once before its final commit. In a worktree: `PYTHONPATH="$WT/engine:$WT/ui-backend" "$MAIN/.venv/bin/pytest" -q …` (`$MAIN` = main code-repo checkout; quote — paths contain spaces).
- **Parallel cap: 4 agents.** Implementers on Opus, task reviewers on Sonnet, final review on Opus.

## File ownership

| Track | Branch (from `main`) | Owns |
|---|---|---|
| A planner | `fau-planner` | `engine/facts_plan/build.py`, `engine/tests/test_facts_plan_build.py`, `engine/tests/test_facts_plan_cards.py` |
| B assembly | `fau-assembly` | `engine/facts_plan/assemble.py`, `engine/tests/test_facts_plan_assemble.py`, `engine/tests/test_unit_gate_tiers.py`, `engine/tests/test_facts_plan_report.py`, `schemas/facts-unit.schema.json` (only if a change proves necessary) |
| C status | `fau-status` (from A's merge) | `engine/facts_plan/cli.py`, `engine/tests/test_facts_plan_status.py`; the `render_phase2_inputs` wiring in `build.py` |
| D playbook | data-repo `fau` | `.claude/agents/quantify.md`, `.claude/skills/quantify/SKILL.md`, `.claude/hooks/test_playbook_lint.py` |
| E docs | `fau-docs` | `docs/runbooks/07-facts.md`, `docs/guides/quantitative-facts-walkthrough.md`, `docs/decisions/0017-facts-pipeline-v3.md` |

A ∥ B ∥ D ∥ E run in parallel (cap 4); C after A is merged; F after all.

---

### Task A: The planner — budgets, phases, related talk, the recorded-so-far slice

**Files:**
- Modify: `engine/facts_plan/build.py` (constants at `:1466`, `transcript_chunks` `:1514`, `fits` `:1580`, `plan_units` `:1688`, `_renderer` `:2489`, `render_input` `:2272`, `_chunks` `:2310`, `build` `:2560`)
- Test: `engine/tests/test_facts_plan_build.py`, `engine/tests/test_facts_plan_cards.py` (the shape-card/section tests already there)

**Interfaces:**
- Consumes: nothing new. `_tokens(text) -> set[str]` (`:1075`), `estimate_tokens(text) -> int`, `label_of(candidate)`, `_unit_text(root, unit)`, `fold`.
- Produces (Tasks B, C, D rely on these exact names):
  - constants `IN_BUDGET = 50000`, `OUT_BUDGET = 20000`, `MAX_LINES = 4500`, `TALK_BUDGET = 80000`, `RECORDED_BUDGET = 20000`, `TALK_WINDOW = 40`, `TALK_STEP = 20`, `TALK_HEADING = "## گفت‌وگوهای مرتبط"`, `RECORDED_HEADING = "## آنچه تا کنون ثبت شده"`.
  - every unit dict in `plan.json` carries `"phase": 1 | 2` (`PHASE_OF = {"workbook": 1, "items": 1, "attachment": 1, "transcript": 2}`).
  - `transcripts(root, recordings) -> list[tuple[str, str, list[str]]]` — `(recording, rel, lines)` for every chosen transcript that exists, in the owner's order.
  - `anchor_tokens(unit, skeleton, texts) -> set[str]` — `texts` maps an attachment's rel path to its text.
  - `related_talk(tokens, transcripts, budget=TALK_BUDGET, window=TALK_WINDOW, step=TALK_STEP) -> list[dict]` — passages `{"recording", "rel", "first", "last", "text"}` in transcript order.
  - `talk_section(passages) -> str` — the `TALK_HEADING` block (empty string when no passage).
  - `recorded_slice(entries, store_rows, budget=RECORDED_BUDGET) -> list[str]` — phase-1 entries first (every one, until the budget), then the store rows exactly as `reuse_slice` prints them today.
  - `_renderer(...)` returns `render(unit, *, recorded=None)`: with `recorded` (a list of lines) the section «آنچه تا کنون ثبت شده» replaces «ورودی‌های قابل استفادهٔ مجدد»; without it the input is today's.
  - `render_full(unit) -> str` = `render(unit)` + `talk_section(...)` for a phase-1 unit; identical to `render(unit)` for phase 2. `build` writes `render_full`; `fits` is checked on `render` only.

- [ ] **Step 1: Failing tests — budgets and phases**

```python
# engine/tests/test_facts_plan_build.py (append)
from facts_plan.build import (IN_BUDGET, OUT_BUDGET, MAX_LINES, TALK_BUDGET,
                              RECORDED_BUDGET, PHASE_OF, transcript_chunks,
                              plan_units, related_talk, talk_section, anchor_tokens,
                              recorded_slice, TALK_HEADING, RECORDED_HEADING)


def test_the_budgets_are_the_owners_2026_09_15():
    assert (IN_BUDGET, OUT_BUDGET, MAX_LINES) == (50000, 20000, 4500)
    assert (TALK_BUDGET, RECORDED_BUDGET) == (80000, 20000)


def test_a_transcript_chunk_stays_under_the_core_budget_with_the_cards_room():
    text = "\n".join("این یک خط گفت‌وگو دربارهٔ فرم تبدیل است." * 3 for _ in range(6000))
    for first, last in transcript_chunks(text):
        assert estimate_tokens("\n".join(text.splitlines()[first - 1:last])) <= 42000


def test_every_unit_carries_its_phase():
    skeleton = {"candidates": [], "instances": []}
    units = plan_units(skeleton, {}, [("m", "meetings/transcripts/m.txt", (1, 3), "a\nb\nc")],
                       [], ["departments/x/attachments/.text/p.image.md"])
    assert {u["type"]: u["phase"] for u in units} == {"transcript": 2, "attachment": 1}
    assert PHASE_OF == {"workbook": 1, "items": 1, "attachment": 1, "transcript": 2}
```

- [ ] **Step 2: Run to verify they fail**

Run: `PYTHONPATH="$WT/engine:$WT/ui-backend" "$MAIN/.venv/bin/pytest" -q engine/tests/test_facts_plan_build.py -k "budgets or chunk_stays or carries_its_phase"`
Expected: FAIL — `ImportError` on the new names.

- [ ] **Step 3: Constants, chunk budget, phases**

```python
IN_BUDGET, OUT_BUDGET = 50000, 20000       # owner 2026-09-15: core 50K; output stays the binding cap
MAX_LINES, MAX_LINE = 4500, 1900
TALK_BUDGET, RECORDED_BUDGET = 80000, 20000
TALK_WINDOW, TALK_STEP = 40, 20
TALK_HEADING = "## گفت‌وگوهای مرتبط"
RECORDED_HEADING = "## آنچه تا کنون ثبت شده"
PHASE_OF = {"workbook": 1, "items": 1, "attachment": 1, "transcript": 2}
```

`transcript_chunks(text, budget=42000)`. In `plan_units`, every `units.append({...})` gains `"phase": PHASE_OF[<type>]`; `split_unit` parts inherit it through `dict(unit, ...)`.

- [ ] **Step 4: Run Step 1's tests → PASS. Commit** `feat(facts): planner budgets of 2026-09-15 and a phase per unit` — `git commit -- engine/facts_plan/build.py engine/tests/test_facts_plan_build.py`.

- [ ] **Step 5: Failing tests — related talk**

```python
LINES_A = ["سلام، امروز دربارهٔ فرم تبدیل برگر حرف می‌زنیم"] + ["حرف‌های دیگر"] * 30 + \
          ["بازدهی خروجی هر روز توی جدول بازدهی نوشته می‌شه", "ورودی کیلو رو هم ثبت کنید"] + \
          ["حرف‌های دیگر"] * 60
LINES_B = ["دربارهٔ مرخصی پرسنل"] * 50
TR = [("prep-1405-06-01", "meetings/transcripts/prep-1405-06-01.txt", LINES_A),
      ("prep-1405-06-02", "meetings/transcripts/prep-1405-06-02.txt", LINES_B)]
TOKENS = {"بازدهی", "خروجی", "ورودی", "کیلو", "فرم", "تبدیل", "برگر"}


def test_related_talk_takes_the_windows_that_name_the_form_and_merges_touching_ones():
    passages = related_talk(TOKENS, TR, budget=80000, window=40, step=20)
    assert [p["rel"] for p in passages] == [TR[0][1]]          # transcript B scores 0 everywhere
    assert passages[0]["first"] == 1 and passages[0]["last"] >= 33    # both hits, one merged passage
    assert "جدول بازدهی" in passages[0]["text"]


def test_a_zero_score_window_is_never_taken_even_under_budget():
    assert related_talk({"واژه‌ای"}, TR) == []


def test_related_talk_is_cut_at_the_budget_best_window_first():
    long = [("m", "meetings/transcripts/m.txt", ["فرم تبدیل برگر و بازدهی خروجی"] * 400)]
    passages = related_talk(TOKENS, long, budget=3000)      # a window is ≈800 tokens: three fit
    assert sum(estimate_tokens(p["text"]) for p in passages) <= 3000
    assert passages == [dict(passages[0], first=1, last=80)]  # equal scores → first windows, merged


def test_the_talk_section_heads_each_passage_with_the_date_and_lines():
    section = talk_section([{"recording": "prep-1405-06-01", "rel": TR[0][1],
                             "first": 1, "last": 33, "text": "x"}])
    assert section.startswith(TALK_HEADING)
    assert "۱۴۰۵/۰۶/۰۱ · L1–L33" in section
    assert talk_section([]) == ""


def test_anchor_tokens_come_from_titles_columns_aliases_and_attachment_heads():
    skeleton = {"candidates": [{"id": "S-rec-1", "kind": "record", "payload": {
        "instances": [{"key": "b__s1", "sheet": "بازدهی", "spreadsheetId": "x"}],
        "aliases": ["بازده تولید"],
        "fields": [{"key": "c_b", "title": "ورودی (کیلو)"}]}}], "instances": []}
    unit = {"id": "u-wb-b", "type": "workbook", "candidates": ["S-rec-1"], "inputs": []}
    assert {"بازدهی", "بازده", "تولید", "ورودی", "کیلو"} <= anchor_tokens(unit, skeleton, {})
    att = {"id": "u-att-1", "type": "attachment", "candidates": [],
           "inputs": ["d/attachments/.text/p.image.md"]}
    texts = {"d/attachments/.text/p.image.md": "# فرم تحویل مرغ\nستون: وزن\n"}
    assert {"فرم", "تحویل", "مرغ"} <= anchor_tokens(att, skeleton, texts)
```

- [ ] **Step 6: Run → FAIL (names missing). Implement**

```python
def _fa(n):
    return str(n).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def _recording_label(recording):
    """`prep-1405-06-01-02` → `۱۴۰۵/۰۶/۰۱ (۲)`; a stem with no date is shown as
    is — an owner name, never a path."""
    m = re.search(r"([0-9]{4})-([0-9]{2})-([0-9]{2})(?:-0*([0-9]+))?$", recording)
    if not m:
        return recording
    label = "/".join(_fa(m.group(i)) for i in (1, 2, 3))
    return label + (f" ({_fa(m.group(4))})" if m.group(4) else "")


def transcripts(root, recordings):
    """`[(recording, rel, lines)]` — every chosen transcript that exists, in
    the owner's order; `_chunks` and `related_talk` both read this."""
    out = []
    for recording in recordings:
        rel = f"meetings/transcripts/{recording}.txt"
        path = pathlib.Path(root) / rel
        if not path.is_file():
            print(f"facts-plan: no transcript for {recording}", file=sys.stderr)
            continue
        out.append((recording, rel, path.read_text(encoding="utf-8").splitlines()))
    return out


def anchor_tokens(unit, skeleton, texts):
    """The words a form unit is about — its candidates' labels, titles,
    aliases, column titles and row labels; an attachment's headings and first
    twelve lines. `_tokens` folds and drops the short words."""
    by_id = {c["id"]: c for c in skeleton["candidates"]}
    words = []
    for cid in unit["candidates"]:
        c = by_id[cid]
        payload = c.get("payload") or {}
        words += [label_of(c), payload.get("title") or "", payload.get("output") or ""]
        words += list(payload.get("aliases") or [])
        words += [f.get("title") or "" for f in payload.get("fields") or []]
        words += [str(v) for row in payload.get("rows") or [] if isinstance(row, dict)
                  for v in row.values() if isinstance(v, str)]
    if unit["type"] == "attachment":
        for ref in unit["inputs"]:
            lines = texts.get(ref.partition("#")[0], "").splitlines()
            words += lines[:12] + [l for l in lines if l.startswith("#")]
    return _tokens(" ".join(words))


def related_talk(tokens, transcripts, budget=TALK_BUDGET, window=TALK_WINDOW,
                 step=TALK_STEP):
    """Spec §3 phase 1: the transcript windows that share the most words with
    the unit, best first until `budget`, touching windows merged, printed in
    transcript order. A window sharing nothing is never taken. Deterministic:
    ties fall to transcript order, then position."""
    scored = []
    for order, (recording, rel, lines) in enumerate(transcripts):
        for first in range(1, max(len(lines), 1) + 1, step):
            last = min(first + window - 1, len(lines))
            text = "\n".join(lines[first - 1:last])
            score = len(tokens & _tokens(text))
            if score:
                scored.append((-score, order, first, last, recording, rel))
            if last == len(lines):
                break
    taken, spent = [], 0
    for neg, order, first, last, recording, rel in sorted(scored):
        cost = estimate_tokens("\n".join(transcripts[order][2][first - 1:last]))
        if spent + cost > budget:
            continue
        spent += cost
        taken.append((order, first, last, recording, rel))
    passages = []
    for order, first, last, recording, rel in sorted(taken):
        if passages and passages[-1]["rel"] == rel and first <= passages[-1]["last"] + 1:
            passages[-1]["last"] = max(passages[-1]["last"], last)
        else:
            passages.append({"recording": recording, "rel": rel,
                             "first": first, "last": last, "text": ""})
    by_rel = {rel: lines for _, rel, lines in transcripts}
    for p in passages:
        p["text"] = "\n".join(by_rel[p["rel"]][p["first"] - 1:p["last"]])
    return passages


def talk_section(passages):
    if not passages:
        return ""
    out = ["", TALK_HEADING, ""]
    for p in passages:
        out += [f'### {_recording_label(p["recording"])} · L{p["first"]}–L{p["last"]}', "",
                "\n".join(w for line in p["text"].splitlines() for w in _wrap(line)), ""]
    return "\n".join(out)
```

Replace `_chunks` so it reads `transcripts(root, recordings)` and cuts each with `transcript_chunks` — the same tuples as before.

- [ ] **Step 7: Run Step 5's tests → PASS. Commit** `feat(facts): related talk — the transcript windows about a form, ranked and cut at the budget`.

- [ ] **Step 8: Failing tests — the input**

```python
def test_a_form_units_input_ends_with_the_talk_and_the_fit_check_ignores_it(tmp_path):
    # a workbook unit whose core is under budget and whose talk would be over it
    root = _tiny_estate(tmp_path)                       # the module's existing fixture helper
    (root / "meetings" / "transcripts").mkdir(parents=True)
    (root / "meetings" / "transcripts" / "prep-1405-06-01.txt").write_text(
        "\n".join(["بازدهی خروجی و ورودی کیلو و فرم تبدیل"] * 9000), encoding="utf-8")
    run = tmp_path / "run"
    build(root, "preparation", run, ["prep-1405-06-01"])
    plan = read_json(run / "plan.json")
    wb = next(u for u in plan["units"] if u["type"] == "workbook")
    text = (run / "units" / wb["id"] / "input.md").read_text(encoding="utf-8")
    core, _, talk = text.partition(TALK_HEADING)
    assert talk and estimate_tokens(core) <= IN_BUDGET
    assert estimate_tokens(talk) <= TALK_BUDGET + 500       # the heading lines
    assert not [u for u in plan["units"] if u["id"].startswith(wb["id"] + "-s")]  # no split by talk


def test_two_builds_are_byte_identical(tmp_path):
    root = _tiny_estate(tmp_path)
    a = build(root, "preparation", tmp_path / "r1", [])
    b = build(root, "preparation", tmp_path / "r2", [])
    assert a == b
    for p in (tmp_path / "r1" / "units").rglob("input.md"):
        q = tmp_path / "r2" / "units" / p.relative_to(tmp_path / "r1" / "units")
        assert p.read_bytes() == q.read_bytes()


def test_a_transcript_units_recorded_section_replaces_the_reuse_slice():
    lines = recorded_slice([
        {"handle": "S-rec-1", "kind": "record", "key": "bazdehi", "title": "بازدهی تولید",
         "data": {"fields": [{"key": "vorudi", "title": "ورودی", "unit": "kg"}]}},
        {"handle": "N-u-att-1-2", "kind": "rule", "key": "saqf", "title": "سقف ضایعات",
         "statement": "ضایعات از ده درصد بیشتر نمی‌شود"}],
        ["F-00001 · record · units · واحدها"])
    assert lines[0] == "S-rec-1 · record · bazdehi · بازدهی تولید · ستون‌ها: vorudi (ورودی، kg)"
    assert lines[1].startswith("N-u-att-1-2 · rule · saqf · سقف ضایعات · ضایعات از ده")
    assert lines[-1] == "F-00001 · record · units · واحدها"
```

If `test_facts_plan_build.py` has no estate fixture helper named `_tiny_estate`, use the smallest existing helper in that file that yields a root with one workbook (read the file first; the synthetic-estate generator from the 2026-09-08 generality work is `engine/tests/facts_helpers.py` / `test_facts_plan_generality.py`), and name it in the report.

- [ ] **Step 9: Run → FAIL. Implement**

In `_renderer`: keep `render(unit)` as the core; add

```python
    talk_input = transcripts(root, recordings)          # `recordings`: a new _renderer parameter

    def render(unit, *, recorded=None):
        ...  # as today, except:
        extras["reuse"] = (recorded if recorded is not None
                           else reuse_slice(own, index, item_units, department, tokens))
        rendered[unit["id"]] = render_input(unit, skeleton, extras, conventions,
                                            recorded=recorded is not None)

    def render_full(unit):
        core = render(unit)
        if unit.get("phase", PHASE_OF[unit["type"]]) != 1:
            return core
        att = {ref.partition("#")[0]: _unit_text(root, {"inputs": [ref]})
               for ref in unit["inputs"] if ref.partition("#")[0].endswith((".txt", ".md"))}
        return core + talk_section(related_talk(anchor_tokens(unit, skeleton, att), talk_input))

    render.full = render_full
    return render
```

`render_input(..., recorded=False)`: the loop over `("## ورودی‌های قابل استفادهٔ مجدد", "reuse")` uses `RECORDED_HEADING` for that key when `recorded` is true. `build` writes `render.full(unit)` for every unit; `plan_units` keeps calling `render` (the core). `_renderer` gains a `recordings` parameter; `refresh_inputs` passes `[]` for it (it re-renders cores; Task C adds the phase-2 path).

```python
def recorded_slice(entries, store_rows, budget=RECORDED_BUDGET):
    """Spec §3 phase 2: what phase 1 recorded, every entry with its handle and
    — for a record — its columns; then the store's rows as `reuse_slice`
    prints them. Cut at `budget`, phase-1 entries first."""
    lines, spent = [], 0
    for e in entries:
        parts = [e["handle"], e["kind"], e.get("key") or "", e.get("title") or ""]
        data = e.get("data") or {}
        if e["kind"] == "record" and data.get("fields"):
            cols = " · ".join(f'{f.get("key")} ({f.get("title") or ""}'
                              + (f'، {f["unit"]}' if f.get("unit") else "") + ")"
                              for f in data["fields"])
            parts.append(f"ستون‌ها: {cols}")
        elif e["kind"] == "item" and data.get("code"):
            parts.insert(2, data["code"])
        elif e.get("statement"):
            parts.append(e["statement"][:200])
        line = " · ".join(p for p in parts if p)
        cost = estimate_tokens(line) + 1
        if spent + cost > budget:
            break
        lines.append(line)
        spent += cost
    for row in store_rows:
        cost = estimate_tokens(row) + 1
        if spent + cost > budget:
            break
        lines.append(row)
        spent += cost
    return lines
```

- [ ] **Step 10: Run the planner suites** — `test_facts_plan_build.py`, `test_facts_plan_cards.py`, `test_facts_plan_generality.py`, `test_facts_plan_preflight.py` → pass (the generality property builds 24 seeded estates: it must still hold with the new budgets). Then the whole engine suite once.

- [ ] **Step 11: Commit** `feat(facts): a form unit reads the talk about its tables; a transcript unit is told what phase 1 recorded` — by path.

---

### Task B: The assembly — unit-written accounts, phase-1 handles from phase-2, source kinds for the reviewer

**Files:**
- Modify: `engine/facts_plan/assemble.py` (`ENGINE_OWNED` `:72`, the A7 drop at `:137`, `_resolve_refs` `:1870`, `_digest_text`, `_cross_unit` `:2008`)
- Test: `engine/tests/test_unit_gate_tiers.py`, `engine/tests/test_facts_plan_assemble.py`, `engine/tests/test_facts_plan_report.py`

**Interfaces:**
- Consumes: nothing from Task A at code level (the phase-1 handles are the `S-…` and `N-<unit>-<n>` strings the assembly already mints; Task A prints them).
- Produces:
  - `phase_entries(root, run_dir, unit_ids) -> list[dict]` — the gated, folded entries of the named units, each with `handle` (`_skeleton`: `S-…` or `N-<unit>-<n>`), `kind`, `key`, `title`, `statement`, `data`. Task C calls it to render phase-2 inputs. Deterministic; reads only `units/<u>/out.*.json` of the named units.
  - A unit decision or `new[]` entry may carry `accounts: [{"path": "<QF-7 path>", "value": <scalar>, "source": {"type": "voice", "ref": "<a chosen transcript rel>", "lines": "a-b"}}]`; the engine keeps such members (status `open`, id minted by `apply` as today), drops any other shape silently (A7 REPAIR) and refuses none.
  - The review digest line per entry gains `منابع: <kinds>` (`sheet`, `photo`, `voice`, `process`, …, sorted, ` · `-joined).

- [ ] **Step 1: Failing tests**

```python
# engine/tests/test_unit_gate_tiers.py (append; uses the module's _prep_root / _built helpers)
VOICE = {"type": "voice", "ref": "meetings/transcripts/preparation-1405-06-01.txt", "lines": "213-252"}


def _with_account(doc, account):
    doc = copy.deepcopy(doc)
    doc["decisions"][0]["accounts"] = [account]
    return doc


def test_a_units_voice_account_is_kept_open_and_the_form_value_stays_primary(tmp_path):
    root, run_dir = _prep_root(tmp_path)
    path = run_dir / "units" / "u-wb-amadesazi" / "out.1.json"
    doc = _with_account(read_json(path), {"path": "data/fields/c_b/unit", "value": "g", "source": VOICE})
    write_json_atomic(path, doc)
    entry = _built(root, run_dir, path)[0]
    assert entry["accounts"] == [{"path": "data/fields/c_b/unit", "value": "g",
                                  "source": VOICE, "status": "open"}]
    assert entry["data"]["fields"][1]["unit"] != "g"          # the form's value is the entry's


def test_an_account_whose_source_is_not_a_chosen_transcript_is_dropped_silently(tmp_path):
    root, run_dir = _prep_root(tmp_path)
    path = run_dir / "units" / "u-wb-amadesazi" / "out.1.json"
    bad = {"path": "data/fields/c_b/unit", "value": "g",
           "source": {"type": "voice", "ref": "meetings/transcripts/made-up.txt", "lines": "1-2"}}
    write_json_atomic(path, _with_account(read_json(path), bad))
    findings = _judge(root, run_dir, path)[1]
    assert not _refused(findings) and "accounts" not in _built(root, run_dir, path)[0]
```

```python
# engine/tests/test_facts_plan_assemble.py (append)
FORM = {"kind": "record", "key": "form_tahvil", "title": "فرم تحویل", "statement": "",
        "data": {"medium": "paper", "location": {"kept_at": "آشپزخانه", "holder": "سرپرست"},
                 "fields": [{"key": "vazn", "title": "وزن", "type": "number"}]}}
NOTE = {"kind": "note", "key": "n", "title": "یادداشت", "statement": "هر روز وزن می‌شود",
        "data": {"about": [{"ref": "N-u-att-1-1"}]}}


def _two_unit_run(tmp_path, att_new, tr_new):
    """Extend the module's run-building fixture (the one at the top of the file
    that makes `departments/cooking/processes`): a plan with `u-att-1`
    (attachment, phase 1, one photo text) and `u-tr-m-l1` (transcript, phase 2,
    one three-line transcript), and one valid `out.1.json` per unit holding
    `{"skeleton_sha256": …, "decisions": [], "new": <list>}`. Returns
    `(root, run_dir)`."""


def test_a_phase_two_note_addressed_to_a_phase_one_new_entry_lands_on_it(tmp_path):
    """A photo unit's `new[]` form is `N-u-att-1-1`; a transcript unit's note
    with `about: [{"ref": "N-u-att-1-1"}]` resolves to that form's temp id."""
    root, run = _two_unit_run(tmp_path, att_new=[FORM], tr_new=[NOTE])
    assemble(root, run)
    delta = read_json(run / "facts-delta.json")
    form = next(e for e in delta["entries"] if e["key"] == "form_tahvil")
    note = next(e for e in delta["entries"] if e["kind"] == "note")
    assert note["data"]["about"] == [{"ref": form["id"]}]


def test_phase_entries_lists_the_gated_entries_of_the_named_units_with_handles(tmp_path):
    root, run = _two_unit_run(tmp_path, att_new=[FORM], tr_new=[])
    entries = phase_entries(root, run, ["u-att-1"])
    assert [(e["handle"], e["kind"], e["key"]) for e in entries] == [("N-u-att-1-1", "record", "form_tahvil")]
    assert entries[0]["data"]["fields"][0]["key"] == "vazn"
```

```python
# engine/tests/test_facts_plan_report.py (append)
def test_the_digest_names_each_entrys_source_kinds(tmp_path):
    root, run = _digest_run(tmp_path)         # the module's digest fixture
    text = (run / "review" / "input.md").read_text(encoding="utf-8")
    assert re.search(r"منابع: (photo|sheet|voice|process)( · (photo|sheet|voice|process))*", text)
```

- [ ] **Step 2: Run → FAIL. Implement**

*Accounts (A7 exception):* in the drop at `:137`, before deleting `accounts`, keep the well-formed members:

```python
def _unit_accounts(node, chosen):
    """Spec 2026-09-15: a unit may write an account only for what it heard —
    a scalar with a `voice` source naming one of the run's chosen
    transcripts and its lines. Anything else is dropped as A7 drops every
    engine-owned member (REPAIR, no note)."""
    out = []
    for a in node.get("accounts") or []:
        src = a.get("source") if isinstance(a, dict) else None
        if (isinstance(src, dict) and src.get("type") == "voice"
                and src.get("ref") in chosen and re.fullmatch(r"[0-9]+-[0-9]+", str(src.get("lines")))
                and isinstance(a.get("path"), str) and a.get("value") is not None
                and not isinstance(a["value"], (dict, list))):
            out.append({"path": a["path"], "value": a["value"], "source": src, "status": "open"})
    return out
```

`chosen` = the transcript rels in `plan.json` `hashes` (the run's inputs). The kept list is set back on the decision after the drop, and `_entry` copies it onto the entry (`entry["accounts"] = written.get("accounts") or []` before `_cross_unit`, which already appends). `apply` mints ids for open accounts today — verify with `test_merge_facts_apply.py`'s account tests and add one if none covers a unit-written account reaching the store.

*Handles:* read `_resolve_refs` `:1870-1935`. If `N-<unit>-<n>` already resolves across units (the pseudo-candidate is in `by_skeleton` for every entry), the test passes on the first run — then the task's deliverable is the test and a docstring line saying so. If not, extend `by_skeleton` to include every unit's `new[]` pseudo-candidates before the hold-back loop.

*`phase_entries`:*

```python
def phase_entries(root, run_dir, unit_ids):
    """The gated, folded entries of the named units — what a phase-2 unit is
    told is recorded (spec 2026-09-15 §3). Same fold `assemble` uses, over
    those units only; nothing is minted and nothing is written."""
    run_dir, skeleton, state = _prepare(pathlib.Path(root), pathlib.Path(run_dir), False,
                                        only=set(unit_ids))
    out = []
    for e in _build_entries(root, skeleton, state):
        out.append({"handle": e["_skeleton"], "kind": e["kind"], "key": e.get("key"),
                    "title": e.get("title"), "statement": e.get("statement"),
                    "data": copy.deepcopy(e.get("data") or {})})
    return sorted(out, key=lambda e: (KIND_ORDER.index(e["kind"]), e["handle"]))
```

`_prepare(..., only=None)`: when `only` is given, units outside it are treated as absent (no attempts read). Read `_prepare` first; add the parameter where it lists the units.

*Digest:* in `_digest_text`, after the entry's title line add `منابع: ` + ` · `.join(sorted({s["type"] for s in e.get("source") or []})).

- [ ] **Step 3: Run the assembly suites** — `test_unit_gate_tiers.py`, `test_facts_plan_assemble.py`, `test_facts_plan_report.py`, `test_facts_evidence_types.py`, `test_merge_facts_apply.py` → pass; then the whole engine suite once.

- [ ] **Step 4: Commit** `feat(facts): a unit may account for what it heard; phase-1 handles resolve from phase 2; the reviewer sees source kinds` — by path.

---

### Task C: `status` — phase gating and phase-2 rendering

**Branch:** `fau-status` from `main` after Task A is merged.

**Files:**
- Modify: `engine/facts_plan/cli.py` (`unit_states` `:123`, `_stage` `:186`, `status` `:199`, the table printer), `engine/facts_plan/build.py` (one function: `render_phase2_inputs`)
- Test: `engine/tests/test_facts_plan_status.py`

**Interfaces:**
- Consumes: Task A's `phase` per unit, `_renderer(...)` → `render(unit, recorded=...)`, `recorded_slice`, `_store_slice`, `RECORDED_HEADING`; Task B's `phase_entries(root, run_dir, unit_ids)`.
- Produces:
  - unit state `waiting` — a phase-2 unit while any phase-1 unit is `pending` or owes a `retry`. `_stage` returns `"U"` for `waiting` too. The printed table shows `waiting` in the state column; the playbook (Task D) never dispatches a `waiting` unit.
  - `status` output gains `"phase": 1 | 2` (the lowest phase with open units, `2` once phase 1 is over, `None` when all done).
  - `render_phase2_inputs(root, run_dir) -> list[str]` (in `build.py`): for every phase-2 unit whose `input.md` lacks `RECORDED_HEADING`, re-renders it with `recorded=recorded_slice(phase_entries(root, run_dir, <phase-1 unit ids>), <store rows>)`; returns the unit ids rendered. `status` calls it the first time it finds phase 1 over; idempotent afterwards.

- [ ] **Step 1: Failing tests**

```python
# engine/tests/test_facts_plan_status.py (append; use the module's run fixture)
def test_a_transcript_unit_waits_while_a_form_unit_is_open(planned_run):
    root, run = planned_run                 # one workbook unit, one transcript unit, no outputs
    out = status(root, run)
    assert {u["id"]: u["state"] for u in out["units"]} == {"u-wb-x": "pending", "u-tr-m-l1": "waiting"}
    assert out["stage"] == "U" and out["phase"] == 1


def test_phase_two_opens_and_its_inputs_are_rendered_once_phase_one_is_over(planned_run):
    root, run = planned_run
    _finish(run, "u-wb-x")                  # a valid out.1.json for the workbook unit
    out = status(root, run)
    assert {u["id"]: u["state"] for u in out["units"]} == {"u-wb-x": "done", "u-tr-m-l1": "pending"}
    assert out["phase"] == 2
    text = (run / "units" / "u-tr-m-l1" / "input.md").read_text(encoding="utf-8")
    assert RECORDED_HEADING in text and "## ورودی‌های قابل استفادهٔ مجدد" not in text
    before = text
    status(root, run)                       # idempotent: a second status does not rewrite it
    assert (run / "units" / "u-tr-m-l1" / "input.md").read_text(encoding="utf-8") == before


def test_a_failed_form_unit_still_opens_phase_two(planned_run):
    root, run = planned_run
    _refuse_twice(run, "u-wb-x")            # two refused attempts → failed
    out = status(root, run)
    assert next(u["state"] for u in out["units"] if u["id"] == "u-tr-m-l1") == "pending"


def test_a_run_with_only_transcripts_has_no_waiting(planned_transcripts_only):
    root, run = planned_transcripts_only
    assert all(u["state"] == "pending" for u in status(root, run)["units"])
```

- [ ] **Step 2: Run → FAIL. Implement**

```python
# cli.py, after unit_states computes `out`:
def _gate_phases(units, states):
    phase_of = {u["id"]: u.get("phase", 1) for u in units}
    open1 = any(phase_of[s["id"]] == 1 and (s["state"] == "pending" or s.get("retry"))
                for s in states)
    for s in states:
        if open1 and phase_of[s["id"]] == 2 and s["state"] == "pending":
            s["state"] = "waiting"
    open2 = any(phase_of[s["id"]] == 2 and (s["state"] in ("pending", "waiting") or s.get("retry"))
                for s in states)
    return 1 if open1 else 2 if open2 else None
```

`status()`: `phase = _gate_phases(units, states)`; if `phase == 2` (phase 1 over, phase 2 open): `render_phase2_inputs(root, run_dir)`; return `{..., "phase": phase}`. `_stage`: `"U"` when any state in `("pending", "waiting")` or `retry`. The table printer prints `waiting` like any state.

```python
# build.py
def render_phase2_inputs(root, run_dir):
    """Spec 2026-09-15 §3 phase 2: once phase 1 is over, every transcript
    unit's input is rendered again with what phase 1 recorded. Only inputs
    still without the section are written, so a second call changes nothing."""
    from facts_plan.assemble import phase_entries
    root, run_dir = pathlib.Path(root), pathlib.Path(run_dir)
    plan = read_json(run_dir / "plan.json")
    skeleton = read_json(run_dir / "skeleton.json")
    todo = [u for u in plan["units"] if u.get("phase") == 2
            and RECORDED_HEADING not in (run_dir / "units" / u["id"] / "input.md").read_text(encoding="utf-8")]
    if not todo:
        return []
    done1 = [u["id"] for u in plan["units"] if u.get("phase", 1) == 1]
    index, item_units = _store_slice(root)
    entries = phase_entries(root, run_dir, done1)
    render = _renderer(root, skeleton["department"], load_estate(root), skeleton, {},
                       load_conventions(root), recordings=[])
    for unit in todo:
        tokens = _tokens(_unit_text(root, unit))
        rows = reuse_slice([], index, item_units, skeleton["department"], tokens)
        text = render(unit, recorded=recorded_slice(entries, rows))
        write_text_atomic(run_dir / "units" / unit["id"] / "input.md", text)
    return [u["id"] for u in todo]
```

- [ ] **Step 3: Run `test_facts_plan_status.py`, then the whole engine suite → pass. Commit** `feat(facts): status holds the transcript units until the forms are decided, then tells them what was recorded` — by path.

---

### Task D: Agent text and playbook

**Worktree:** data-repo branch `fau` from data `main`, checked out at `code-repo/.claude/worktrees/data-fau`.

**Files:**
- Modify: `.claude/agents/quantify.md` (`## Inputs` `:37`, `## The unit contract` `:56`, «One candidate, one unit» `:115`, `## The reuse rule` `:344`), `.claude/skills/quantify/SKILL.md` (Stage U `:247-320`), `.claude/hooks/test_playbook_lint.py` (add pins next to `test_stage_u_states_the_two_caps_as_the_engine_s` `:232`)

**Interfaces:**
- Consumes: the two headings (`## گفت‌وگوهای مرتبط`, `## آنچه تا کنون ثبت شده`), the `waiting` state and `phase` in `status`, the account shape from Task B, the handles `S-…` / `N-<unit>-<n>`.

- [ ] **Step 1: Failing pins** in `test_playbook_lint.py`:

```python
def test_stage_u_never_dispatches_a_waiting_unit(playbook):
    assert "A unit `status` prints as `waiting` is never dispatched" in playbook

def test_the_agent_reads_the_talk_beside_the_form_and_keeps_the_forms_value(agent):
    assert "## گفت‌وگوهای مرتبط" in agent
    assert "the table's columns and values are the file's or the photo's" in agent
    assert "the spoken value becomes an `account` on the same entry" in agent

def test_the_agent_attaches_speech_to_a_listed_table_before_describing_a_new_one(agent):
    assert "## آنچه تا کنون ثبت شده" in agent
    assert "describe a new table only when no listed table fits" in agent

def test_review_mode_keeps_the_entry_read_off_a_form(agent):
    assert "when two entries merge, the one read off a form is the keeper" in agent
```

(`playbook` / `agent` are the module's existing fixtures that read the two files; if named differently, use those names and say so in the report.)

- [ ] **Step 2: Write the text.** In `quantify.md`:
  - `## Inputs`: the two sections, one paragraph each — what they hold and that both are the engine's selection, not the whole meeting.
  - `## The unit contract`, after «One candidate, one unit»: **Form first.** For a workbook or attachment unit, «the table's columns and values are the file's or the photo's; the talk fills what the file does not state — titles, units, cadence, holder, thresholds, aliases — and is cited as a `voice` source with its lines. When the talk states a value the form contradicts, the form's value is written and the spoken value becomes an `account` on the same entry: `{"path": "…", "value": …, "source": {"type": "voice", "ref": "<transcript path as printed>", "lines": "a-b"}}`. Never a second entry for it.»
  - `## The reuse rule` → rename to `## What is recorded, and reuse`: for a transcript unit the slice is «آنچه تا کنون ثبت شده»; «a spoken number about a listed table goes to that table, as a `new[]` measurement or note addressed to it by its printed handle (`S-…` or `N-…`), or as an account when it disagrees with a listed value; describe a new table only when no listed table fits.»
  - `### `review` mode`: one sentence — «Each entry's digest line names its source kinds; when two entries merge, the one read off a form is the keeper — a `sheet`, `photo`, `pdf` or `docx` source outranks `voice`, `process` and `chat`.»
  - In `SKILL.md` Stage U: one paragraph after the batching rule: «`status` runs the units in two phases: the workbook, attachment and item units first, then the transcript units. A unit `status` prints as `waiting` is never dispatched; it turns `pending` on its own once every earlier unit is done or failed, and its input is rewritten by the engine at that moment — dispatch it as any other unit.» Keep every pinned sentence verbatim.

- [ ] **Step 3: Run** `"$MAIN/.venv/bin/pytest" -q .claude/hooks` → pass. **Commit** by path: `quantify(playbook): forms first with their talk, transcripts second with what was recorded`.

---

### Task E: Docs

**Branch:** `fau-docs` from `main`.

- [ ] **Step 1:** `docs/runbooks/07-facts.md`: the budget table of spec §4 with the reason (the output cap is the binding one; the first cooking run's crash), the two phases, the two sections, the `waiting` state, unit-written accounts. `docs/guides/quantitative-facts-walkthrough.md`: the phase order in the narrative. `docs/decisions/0017-facts-pipeline-v3.md`: a ruling paragraph dated 2026-09-15 quoting the owner («i'm ok»; «Make it 50K») and naming the spec.
- [ ] **Step 2:** Commit by path: `docs(facts): form-anchored units — phases, budgets, related talk`.

---

### Task F: Integration, final review, local run

- [ ] **Step 1:** Merge `fau-planner`, `fau-assembly` into an integration branch `fau-int` (`--no-ff`); then `fau-status` (built on the merged planner), `fau-docs`. A textual conflict means a track broke ownership — stop and report.
- [ ] **Step 2:** Whole engine suite, `make test`, ui-backend suite → pass. `ui/` is untouched: no vitest/tsc/build.
- [ ] **Step 3:** Real-run fixture check: re-plan the 2026-09-14 preparation run's inputs on a scratch copy of the local data repo (transcripts + the workbook + the 13 photo texts, as `test_unit_gate_tiers`' fixture does for the run) → the workbook unit's talk section contains passages about «بازدهی» and «فرم درخواست کالا»; `plan.json` has ≈7 transcript units instead of 16; two builds byte-identical.
- [ ] **Step 4:** Whole-branch review on Opus against the spec (every § accounted for; the one-tier rule; INV-3 on accounts; determinism). One fix round, scoped re-review.
- [ ] **Step 5: Local run of preparation** on the throwaway data branch (`local-test-fau` from data `main`, store reset to seed `8177ae7`, `facts/originals` removed, the `fau` playbook checked out, the 28 ignored `.xlsx` copied in), headless as on 2026-09-13 (`scratchpad/quantify-run.sh`, HOME sandboxed, `--setting-sources project`). **Success:** phase 1 (workbook + 2 photo units) runs before any transcript unit; the transcript units' inputs carry «آنچه تا کنون ثبت شده» with the phase-1 tables and columns; no unit output stops on the model's output cap (read `stop_reason` in the session transcripts); speech-only records in `facts-delta.json` well under 19 (the 2026-09-14 count); every chosen transcript line read by exactly one unit; the report names nothing lost. Record cost and duration.
- [ ] **Step 6:** Report to the owner. Nothing is pushed and the server is not touched; the throwaway branch is deleted only with the owner's word.
