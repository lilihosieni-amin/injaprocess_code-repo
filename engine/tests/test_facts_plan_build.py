"""`facts-plan build`'s record templates and reference rows, over the mini
estate in `fixtures/facts_plan/make_dump.py`."""
import json
import re

import pytest
from facts_plan.build import (
    IN_BUDGET,
    MAX_LINES,
    OUT_BUDGET,
    PHASE_OF,
    RECORDED_BUDGET,
    RECORDED_HEADING,
    TALK_BUDGET,
    TALK_HEADING,
    anchor_tokens,
    build,
    code_key,
    estimate_tokens,
    header_notes,
    load_estate,
    plan_units,
    record_templates,
    recorded_slice,
    reference_rows,
    related_talk,
    strip_branch,
    talk_section,
    template_signature,
    transcript_chunks,
)
from fixtures.facts_plan.make_dump import make_estate


@pytest.fixture
def estate(tmp_path):
    make_estate(tmp_path)
    return load_estate(tmp_path)


def _by_sheet(candidates, sheet):
    return [c for c in candidates if c["render"]["sheet"] == sheet]


def test_signature_folds_the_branch_token_and_reads_the_header_codes():
    assert strip_branch("شمارش چاله‌باغ") == "شمارش"
    assert template_signature("کانتر ناهارخوران", ["نام", "کسری"]) == ("کانتر", ())
    assert template_signature("آمار", ["نام", "پنیر پیتزا ##1", "Column 3"]) \
        == ("آمار", ("##1",))


def test_two_branch_twins_are_one_template_with_two_instances(estate):
    candidates, instances, _ = record_templates(estate, "cooking")
    pitza = _by_sheet(candidates, "پیتزا")
    assert len(pitza) == 1
    assert [i["key"] for i in pitza[0]["payload"]["instances"]] \
        == ["mini_pitza_ch__s1", "mini_pitza_nk__s1"]
    assert pitza[0]["payload"]["location"]["spreadsheetId"] == "SPCH"
    assert {i["branch"] for i in pitza[0]["payload"]["instances"]} \
        == {"chalebagh", "naharkhoran"}
    assert sum(1 for i in instances if i["template"] == pitza[0]["id"]) == 2


def test_a_mirror_tab_and_an_ids_tab_are_not_templates(estate):
    candidates, _, _ = record_templates(estate, "cooking")
    sheets = {c["render"]["sheet"] for c in candidates}
    assert "Table_Bom" not in sheets and "SheetsFileIDs" not in sheets
    assert len(candidates) == 8


def test_two_tabs_in_one_spreadsheet_never_share_a_template(estate):
    candidates, _, _ = record_templates(estate, "cooking")
    counting = [c for c in candidates
                if c["render"]["signature"][0] == "شمارش"]
    assert len(counting) == 2


def test_a_non_empty_subset_groups_and_an_empty_code_list_does_not(estate):
    candidates, _, _ = record_templates(estate, "cooking")
    amar = [c for c in candidates if c["render"]["signature"][0] == "آمار"]
    grouped = [c for c in amar if len(c["payload"]["instances"]) == 2]
    assert len(amar) == 2 and len(grouped) == 1
    assert [i["key"] for i in grouped[0]["payload"]["instances"]] \
        == ["mini_kanter_ch__s2", "mini_kanter_nk__s2"]


def test_the_offset_twin_keeps_one_field_and_records_the_offset(estate):
    candidates, _, issues = record_templates(estate, "cooking")
    kanter = _by_sheet(candidates, "کانتر")[0]
    first = next(f for f in kanter["payload"]["fields"]
                 if f["title"] == "موجودی اول شب")
    assert first["columns"] == {"mini_kanter_ch__s1": "b",
                                "mini_kanter_nk__s1": "d"}
    assert first["key"] == "c_b"
    assert any(i["kind"] == "column_offset" for i in issues)


def test_two_columns_under_one_header_are_two_fields_and_an_issue(estate):
    """A tab that heads two of its columns alike keeps a field for each: keyed
    by title alone, the later letter overwrote the earlier one, and the column
    that carried the formula was left with no field at all."""
    candidates, _, issues = record_templates(estate, "cooking")
    tab = _by_sheet(candidates, "مغایرت")[0]
    twice = [f for f in tab["payload"]["fields"] if f["title"] == "مغایرت"]
    assert [f["key"] for f in twice] == ["c_b", "c_d"]
    assert [f["columns"] for f in twice] == [{"mini_pitza_ch__s6": "b"},
                                             {"mini_pitza_ch__s6": "d"}]
    said = [i["description"] for i in issues if i["kind"] == "ambiguous_row_header"]
    assert len(said) == 1 and "B" in said[0] and "D" in said[0]


def test_enum_is_the_intersection_and_the_difference_is_cross_record(estate):
    candidates, _, issues = record_templates(estate, "cooking")
    pitza = _by_sheet(candidates, "پیتزا")[0]
    sales = next(f for f in pitza["payload"]["fields"]
                 if f["title"] == "تعداد فروش")
    assert sales["constraints"]["enum"] == ["0", "1"]
    assert any(i["kind"] == "cross_record" for i in issues)


def test_the_label_column_becomes_a_titleless_field_and_the_labels_are_kept(estate):
    candidates, _, _ = record_templates(estate, "cooking")
    pitza = _by_sheet(candidates, "پیتزا")[0]
    label = next(f for f in pitza["payload"]["fields"] if f["key"] == "c_a")
    assert label["title"] is None
    assert pitza["render"]["row_labels"]["mini_pitza_ch__s1"]["6"] \
        == "پنیر پیتزا ##1"
    assert next(f for f in pitza["payload"]["fields"]
                if f["title"] == "انحراف")["type"] == "number"


def test_header_notes_keep_the_unit_sentence_and_drop_the_date_band(estate):
    sheet = estate["SPCH"]["sheets"]["پیتزا"]
    assert header_notes(sheet) == [
        {"column": "d", "text": "پیتزا (تمام وزن ها به کیلوگرم است)"}]


def test_reference_rows_are_keyed_by_code_and_omit_a_blank(estate):
    candidates, _, _ = record_templates(estate, "cooking")
    bom = _by_sheet(candidates, "مواد")[0]
    assert bom["payload"]["primaryKey"] == ["c_a"]
    rows = {r["key"]: r for r in bom["payload"]["rows"]}
    assert set(rows) == {"food_71", "food_61"}
    assert rows["food_71"] == {"key": "food_71", "c_a": "پیتزا آمریکایی #71",
                               "c_b": "215", "c_c": "260"}
    assert "c_d" not in rows["food_71"]      # the dump's blank is an omission
    assert code_key("##1") == "ing_1"


def test_a_repeated_header_inside_one_tab_is_reported(estate):
    header = ["نام", "پنیر پیتزا ##1", "نام"]
    fields = [{"key": "c_a", "title": "نام"}, {"key": "c_b", "title": "پنیر پیتزا ##1"}]
    _, _, issues = reference_rows(estate["SBOM"], "مواد", header, fields)
    assert [i["kind"] for i in issues] == ["ambiguous_row_header"]


#: What an owner-facing sentence may never contain — an instance key, a
#: skeleton or `new[]` handle, a unit id, or a path (data-repo § Language).
LEAK = re.compile(r"__s|S-|N-|u-|/")


def test_no_issue_description_names_an_id_or_a_path(tmp_path):
    """Every `ISSUE_TEXT` kind, rendered over the mini estate. `description`
    reaches `gate-b.md` and `report.md` verbatim, so a column letter and a tab
    name are all the locating it may do."""
    from facts_plan.build import ISSUE_TEXT, _issue, _row_labels
    from facts_plan_helpers import estate as whole_estate

    root = tmp_path / "e"
    est = whole_estate(root)
    (root / "meetings" / "transcripts").mkdir(parents=True)
    (root / "meetings" / "transcripts" / "x.txt").write_text(
        "سطر ۱: موجودی را شمردیم.\n", encoding="utf-8")
    (root / "departments" / "cooking" / "processes").mkdir(parents=True)
    # §3.7: an attachment no row of the dispatch table takes, so `build` raises
    # `unread_attachment` too and its sentence is held to the same rule.
    attachments = root / "departments" / "cooking" / "attachments"
    attachments.mkdir(parents=True)
    (attachments / "چیدمان-انبار.xyz").write_bytes(b"x")
    run = root / "runs" / "facts" / "cooking" / "20260906-101500"
    build(root, "cooking", run, ["x"])
    issues = json.loads((run / "skeleton.json").read_text(
        encoding="utf-8"))["issues"]

    # The three kinds the mini estate cannot raise through `build`.
    _, instances, _ = record_templates(est, "cooking")
    by_key = {i["key"]: i for i in instances}
    labelled = [i for i in instances
                if est[i["spreadsheetId"]]["sheets"][i["sheet"]].get("row_labels")]
    issues += _row_labels([labelled[0], by_key["mini_kanter_ch__s1"]], est)[1]
    sheet = est[labelled[1]["spreadsheetId"]]["sheets"][labelled[1]["sheet"]]
    sheet["head"][sheet["header_row"] - 1][0] = "ردیف"      # a second header
    issues += _row_labels(labelled[:2], est)[1]
    issues += reference_rows(est["SBOM"], "مواد", ["نام", "نام"], [])[2]
    # A candidate `split_unit` sets aside (§3.2) names the owner's own label and
    # nothing else — the mini estate is too small to be over budget.
    issues.append(_issue("oversized", target="S-rec-000000000001",
                         label="انبار مواد اولیه"))

    assert {i["kind"] for i in issues} == set(ISSUE_TEXT)
    for issue in issues:
        assert not LEAK.search(issue["description"]), issue


def test_ids_are_stable_across_two_builds(tmp_path):
    make_estate(tmp_path)
    first = record_templates(load_estate(tmp_path), "cooking")
    second = record_templates(load_estate(tmp_path), "cooking")
    assert [c["id"] for c in first[0]] == [c["id"] for c in second[0]]
    assert all(c["id"].startswith("S-rec-") and len(c["id"]) == 18
               for c in first[0])


# --------------------------------------------------------------------------
# F4 — photos get their own units, and every input is read exactly once.

def _lines_of(units):
    """`Counter((path, line))` over the transcript ranges, `(path, 0)` for a
    whole file — how often each input is read by the plan."""
    import collections
    seen = collections.Counter()
    for unit in units:
        if unit["type"] not in ("transcript", "attachment"):
            continue
        for ref in unit["inputs"]:
            path, _, span = ref.partition("#")
            if not span:
                seen[(path, 0)] += 1
                continue
            first, last = (int(n[1:]) for n in span.split("-"))
            seen.update((path, n) for n in range(first, last + 1))
    return seen


def test_photos_get_their_own_units_and_every_input_is_read_once(
        tmp_path, monkeypatch):
    """The preparation run of 2026-09-12: 13 photo descriptions (~51 KB) rode on
    the last chunk of a 553-line transcript, the chunk was over budget, it was
    halved on its line range alone, and no unit received any photo."""
    import facts_plan.build as build_module
    make_estate(tmp_path)
    transcripts = tmp_path / "meetings" / "transcripts"
    transcripts.mkdir(parents=True)
    (transcripts / "prep.txt").write_text("\n".join(
        f"سطر {n}: " + "آماده‌سازی فیله و برگر را هر صبح وزن می‌کنیم " * 2
        for n in range(1, 554)), encoding="utf-8")
    cache = tmp_path / "departments" / "cooking" / "attachments" / ".text"
    cache.mkdir(parents=True)
    photos = []
    for n in range(1, 14):
        path = cache / f"form-{n:02}.jpg.txt"
        path.write_text(f"عکس {n}\n" + "\n".join(
            f"ردیف {r}: فرم تبدیل مرغ به فیله، وزن قبل و بعد" for r in range(52)),
            encoding="utf-8")
        photos.append(str(path.relative_to(tmp_path)))
    assert 45_000 < sum(len((tmp_path / p).read_bytes()) for p in photos) < 60_000
    monkeypatch.setattr(build_module, "_attachment_state",
                        lambda root, department: (list(photos), []))
    run = tmp_path / "runs" / "facts" / "cooking" / "20260912-101500"

    build(tmp_path, "cooking", run, ["prep"])

    units = json.loads((run / "plan.json").read_text(encoding="utf-8"))["units"]
    attachment_units = [u for u in units if u["type"] == "attachment"]
    assert [u["id"] for u in attachment_units] == \
        [f"u-att-{n}" for n in range(1, len(attachment_units) + 1)]
    # all 13, in input order, and no transcript chunk carries any of them
    assert [p for u in attachment_units for p in u["inputs"]] == photos
    assert all("#" in ref for u in units if u["type"] == "transcript"
               for ref in u["inputs"])
    seen = _lines_of(units)
    assert seen == {**{("meetings/transcripts/prep.txt", n): 1
                       for n in range(1, 554)},
                    **{(p, 0): 1 for p in photos}}
    for unit in attachment_units:
        text = (run / "units" / unit["id"] / "input.md").read_text(
            encoding="utf-8")
        # the budget binds the core; the talk about the forms rides in its own
        # section under a budget of its own (2026-09-15).
        assert estimate_tokens(_talk_and_core(text)[1]) <= IN_BUDGET
        assert all(f"عکس {photos.index(p) + 1}\n" in text
                   for p in unit["inputs"])


def test_attachments_pack_to_the_budget_and_a_huge_one_goes_alone():
    """Packed in input order; one too big for any unit is its own unit, sent
    with an `oversized` issue naming it rather than dropped."""
    size = {"a.txt": 100, "b.txt": 100, "huge.txt": IN_BUDGET * 3, "c.txt": 100}
    render = lambda u: "x" * sum(size[p] for p in u["inputs"])   # noqa: E731
    skeleton = {"candidates": [], "instances": []}

    units = plan_units(skeleton, {}, [], list(size), render=render)

    assert [(u["id"], u["type"], u["inputs"]) for u in units] == [
        ("u-att-1", "attachment", ["a.txt", "b.txt"]),
        ("u-att-2", "attachment", ["huge.txt"]),
        ("u-att-3", "attachment", ["c.txt"])]
    assert [(i["kind"], i["target"]) for i in skeleton["issues"]] == \
        [("oversized", "huge")]


def test_an_input_no_unit_reads_exits_2_naming_it(monkeypatch, capsys):
    """The plan invariant over inputs: a transcript range or an attachment
    that reaches no unit stops `build`, naming the file."""
    import facts_plan.build as build_module
    monkeypatch.setattr(build_module, "split_unit",
                        lambda unit, *args, **kwargs: [])   # loses everything
    with pytest.raises(SystemExit) as excinfo:
        plan_units({"candidates": [], "instances": []}, {},
                   [("prep", "meetings/transcripts/prep.txt", (1, 9), "x")],
                   ["departments/cooking/attachments/.text/form.txt"],
                   render=lambda u: "x" * (IN_BUDGET * 2))
    assert excinfo.value.code == 2
    err = capsys.readouterr().err
    assert "meetings/transcripts/prep.txt" in err
    assert "departments/cooking/attachments/.text/form.txt" in err


# --------------------------------------------------------------------------
# form-anchored units (2026-09-15) — the budgets, the phases, the related talk
# and the recorded-so-far slice.

def test_the_budgets_are_the_owners_2026_09_15():
    assert (IN_BUDGET, OUT_BUDGET, MAX_LINES) == (50000, 20000, 4500)
    assert (TALK_BUDGET, RECORDED_BUDGET) == (80000, 20000)


def test_a_transcript_chunk_stays_under_the_core_budget_with_the_cards_room():
    text = "\n".join("این یک خط گفت‌وگو دربارهٔ فرم تبدیل است." * 3
                     for _ in range(6000))
    for first, last in transcript_chunks(text):
        assert estimate_tokens(
            "\n".join(text.splitlines()[first - 1:last])) <= 42000


def test_every_unit_carries_its_phase():
    skeleton = {"candidates": [], "instances": []}
    units = plan_units(
        skeleton, {}, [("m", "meetings/transcripts/m.txt", (1, 3), "a\nb\nc")],
        ["departments/x/attachments/.text/p.image.md"])
    assert {u["type"]: u["phase"] for u in units} == {"transcript": 2,
                                                      "attachment": 1}
    assert PHASE_OF == {"workbook": 1, "attachment": 1, "transcript": 2}


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
    # both hits, one merged passage
    assert passages[0]["first"] == 1 and passages[0]["last"] >= 33
    assert "جدول بازدهی" in passages[0]["text"]


def test_a_zero_score_window_is_never_taken_even_under_budget():
    assert related_talk({"واژه‌ای"}, TR) == []


def test_related_talk_is_cut_at_the_budget_best_window_first():
    long = [("m", "meetings/transcripts/m.txt", ["فرم تبدیل برگر و بازدهی خروجی"] * 400)]
    passages = related_talk(TOKENS, long, budget=2500)
    assert sum(estimate_tokens(p["text"]) for p in passages) <= 2500
    # equal scores → the first windows, merged; the first costs its 40 lines
    # and every later one only the 20 it adds, so 2500 buys 140 lines.
    assert passages == [dict(passages[0], first=1, last=140)]


def test_the_talk_budget_is_not_halved_by_overlapping_windows():
    """At step 20 a window overlaps its neighbour by half. Charging each its own
    40 lines spent the budget twice on the same talk and delivered half of it;
    a window is priced on the lines it adds, so the budget is nearly filled."""
    long = [("m", "meetings/transcripts/m.txt",
             ["فرم تبدیل برگر و بازدهی خروجی"] * 4000)]
    passages = related_talk(TOKENS, long, budget=40000)
    spent = sum(estimate_tokens(p["text"]) for p in passages)
    assert 40000 - 700 <= spent <= 40000            # within one window of it


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
        "fields": [{"key": "c_b", "title": "ورودی (کیلو)"}]},
        # the row labels a meeting calls the table's rows by live in `render`,
        # never in `payload` — `_view` is the only place both are visible.
        "render": {"row_labels": {"b__s1": {"4": "شنبه", "5": "یکشنبه"}}}}],
        "instances": []}
    unit = {"id": "u-wb-b", "type": "workbook", "candidates": ["S-rec-1"], "inputs": []}
    assert {"بازدهی", "بازده", "تولید", "ورودی", "کیلو",
            "شنبه", "یکشنبه"} <= anchor_tokens(unit, skeleton, {})
    att = {"id": "u-att-1", "type": "attachment", "candidates": [],
           "inputs": ["d/attachments/.text/p.image.md"]}
    texts = {"d/attachments/.text/p.image.md": "# فرم تحویل مرغ\nستون: وزن\n"}
    assert {"فرم", "تحویل", "مرغ"} <= anchor_tokens(att, skeleton, texts)


def _tiny_estate(tmp_path):
    """The module's own mini estate, under a root of its own so a run directory
    beside it is not part of the estate."""
    root = tmp_path / "e"
    make_estate(root)
    return root


def _talk_and_core(text):
    """`input.md` split in two: the talk block, and everything else — the core
    the budget is checked on. The talk sits mid-document (§3: beside the tables
    it is about), so it ends at the next `## ` heading; its own passage
    headings are `### `, which that never matches."""
    head, sep, rest = text.partition(TALK_HEADING)
    if not sep:
        return "", text
    body, found, tail = rest.partition("\n## ")
    return body, head + ("## " + tail if found else "")


def test_a_form_units_input_ends_with_the_talk_and_the_fit_check_ignores_it(tmp_path):
    # a workbook unit whose core is under budget and whose talk would be over it
    root = _tiny_estate(tmp_path)
    (root / "meetings" / "transcripts").mkdir(parents=True)
    (root / "meetings" / "transcripts" / "prep-1405-06-01.txt").write_text(
        "\n".join(["شمارش موجودی پیتزا و پنیر را هر روز در جدول می‌نویسیم"] * 9000),
        encoding="utf-8")
    run = tmp_path / "run"
    build(root, "cooking", run, ["prep-1405-06-01"])
    plan = json.loads((run / "plan.json").read_text(encoding="utf-8"))
    wb = next(u for u in plan["units"] if u["type"] == "workbook")
    text = (run / "units" / wb["id"] / "input.md").read_text(encoding="utf-8")
    talk, core = _talk_and_core(text)
    assert talk and estimate_tokens(core) <= IN_BUDGET
    assert estimate_tokens(talk) <= TALK_BUDGET + 500       # the heading lines
    # §3: beside the tables, and the contract cards stay closest to the answer.
    assert text.index(TALK_HEADING) < text.index("## زمینه")
    assert text.index(TALK_HEADING) < text.index("Expression card")
    # no split by talk
    assert not [u for u in plan["units"] if u["id"].startswith(wb["id"] + "-s")]


def test_two_builds_are_byte_identical(tmp_path):
    root = _tiny_estate(tmp_path)
    (root / "meetings" / "transcripts").mkdir(parents=True)
    for stem in ("zeta-1405-06-02", "alpha-1405-06-01"):
        (root / "meetings" / "transcripts" / f"{stem}.txt").write_text(
            "\n".join(["شمارش موجودی پیتزا و پنیر را هر روز می‌نویسیم"] * 20),
            encoding="utf-8")
    meetings = ["zeta-1405-06-02", "alpha-1405-06-01"]
    a = build(root, "cooking", tmp_path / "r1", meetings)
    b = build(root, "cooking", tmp_path / "r2", meetings)
    assert a == b
    for p in (tmp_path / "r1" / "units").rglob("input.md"):
        q = tmp_path / "r2" / "units" / p.relative_to(tmp_path / "r1" / "units")
        assert p.read_bytes() == q.read_bytes()
    # `plan.json` carries the passages now, and it names no run directory.
    assert (tmp_path / "r1" / "plan.json").read_bytes() == \
        (tmp_path / "r2" / "plan.json").read_bytes()


def test_a_transcript_units_recorded_section_replaces_the_reuse_slice():
    lines = recorded_slice([
        {"handle": "S-rec-1", "kind": "record", "key": "bazdehi", "title": "بازدهی تولید",
         "data": {"fields": [{"key": "vorudi", "title": "ورودی", "unit": "kg"}]}},
        {"handle": "N-u-att-1-2", "kind": "rule", "key": "saqf", "title": "سقف ضایعات",
         "statement": "ضایعات از ده درصد بیشتر نمی‌شود"},
        {"handle": "N-u-att-1-3", "kind": "note", "key": "khamir",
         "title": "خمیر", "statement": "خمیر هر روز صبح آماده می‌شود"}],
        ["F-00001 · record · units · واحدها"])
    assert lines[0] == "S-rec-1 · record · bazdehi · بازدهی تولید · ستون‌ها: vorudi (ورودی، kg)"
    assert lines[1].startswith("N-u-att-1-2 · rule · saqf · سقف ضایعات · ضایعات از ده")
    assert lines[2] == "N-u-att-1-3 · note · khamir · خمیر · " \
                       "خمیر هر روز صبح آماده می‌شود"
    assert lines[-1] == "F-00001 · record · units · واحدها"
    # §3: the same slot, under the heading that says what it now holds.
    from facts_plan.build import render_input
    unit = {"id": "u-tr-x", "type": "transcript", "candidates": [], "inputs": []}
    skeleton = {"candidates": [], "unit_symbols": []}
    text = render_input(unit, skeleton, {"reuse": lines}, recorded=True)
    assert RECORDED_HEADING in text
    assert "## ورودی‌های قابل استفادهٔ مجدد" not in text
    assert "## ورودی‌های قابل استفادهٔ مجدد" in render_input(
        unit, skeleton, {"reuse": lines})


def test_a_passage_heading_names_the_transcript_an_account_must_cite():
    """C1 — the gate admits an account only for the transcript the heading
    prints, so the heading has to print one (§3)."""
    section = talk_section([{"recording": "prep-1405-06-01", "rel": TR[0][1],
                             "first": 213, "last": 252, "text": "x"}])
    assert f'### ۱۴۰۵/۰۶/۰۱ · L213–L252 · {TR[0][1]}' in section


def test_the_plan_records_the_passages_each_unit_was_shown(tmp_path):
    """I5 — `plan.json` is the record of what a unit could see, so the gate can
    check a citation against it; a phase-2 unit was shown none."""
    root = _tiny_estate(tmp_path)
    (root / "meetings" / "transcripts").mkdir(parents=True)
    (root / "meetings" / "transcripts" / "prep-1405-06-01.txt").write_text(
        "\n".join(["شمارش موجودی پیتزا و پنیر را هر روز در جدول می‌نویسیم"] * 20),
        encoding="utf-8")
    run = tmp_path / "run"
    build(root, "cooking", run, ["prep-1405-06-01"])
    plan = json.loads((run / "plan.json").read_text(encoding="utf-8"))
    wb = next(u for u in plan["units"] if u["type"] == "workbook")
    assert wb["talk"] == [{"rel": "meetings/transcripts/prep-1405-06-01.txt",
                           "first": 1, "last": 20}]
    text = (run / "units" / wb["id"] / "input.md").read_text(encoding="utf-8")
    assert f'L1–L20 · {wb["talk"][0]["rel"]}' in text
    assert all(u["talk"] == [] for u in plan["units"] if u["type"] == "transcript")


def test_each_part_of_a_split_form_unit_gets_its_own_talk(tmp_path, monkeypatch):
    """§7 — the talk rides outside the fit check, so both halves of a workbook
    that splits by tab are still shown the meetings about them."""
    import facts_plan.build as B
    root = _tiny_estate(tmp_path)
    (root / "meetings" / "transcripts").mkdir(parents=True)
    (root / "meetings" / "transcripts" / "prep-1405-06-01.txt").write_text(
        "\n".join(["شمارش موجودی پیتزا و پنیر را در جدول مغایرت می‌نویسیم"] * 20),
        encoding="utf-8")
    # just under the pizza book's own core, so that book — and only it —
    # splits. It tracks the shape card: 5100 before the `home` line grew the
    # card by ~770 tokens on 2026-09-16.
    monkeypatch.setattr(B, "IN_BUDGET", 5870)
    run = tmp_path / "run"
    build(root, "cooking", run, ["prep-1405-06-01"])
    plan = json.loads((run / "plan.json").read_text(encoding="utf-8"))
    parts = [u for u in plan["units"] if u["id"].startswith("u-wb-mini_pitza_ch-")]
    assert len(parts) > 1
    with_talk = [p for p in parts if p["talk"]]
    assert len(with_talk) > 1                 # each part selects its own talk
    for part in parts:
        text = (run / "units" / part["id"] / "input.md").read_text(encoding="utf-8")
        assert (TALK_HEADING in text) is bool(part["talk"])
        assert estimate_tokens(_talk_and_core(text)[1]) <= B.IN_BUDGET


def test_a_recorded_record_says_what_it_is_and_where_it_is_kept():
    """I2 — spec §3 phase 2: a record's medium and location, so the transcript
    unit can tell the paper form from the sheet tab."""
    lines = recorded_slice([
        {"handle": "S-rec-1", "kind": "record", "key": "bazdehi", "title": "بازدهی",
         "data": {"medium": "sheet", "location": {"sheet": "بازدهی تولید"},
                  "fields": [{"key": "vorudi", "title": "ورودی", "unit": "kg"}]}},
        {"handle": "N-u-att-1-0", "kind": "record", "key": "tahvil",
         "title": "فرم تحویل مرغ",
         "data": {"medium": "paper",
                  "location": {"kept_at": "آشپزخانه", "holder": "سرآشپز شب"}}}],
        [])
    assert lines[0].endswith("sheet · بازدهی تولید · ستون‌ها: vorudi (ورودی، kg)")
    assert lines[1] == ("N-u-att-1-0 · record · tahvil · فرم تحویل مرغ · "
                        "paper · آشپزخانه · سرآشپز شب")


def test_each_attachment_text_is_headed_by_its_name_and_its_path(tmp_path):
    """Task G 2026-09-16: a unit handed several photos has to tell them apart
    and cite the one an entry was read off, so every `.text/` sidecar is headed
    by the file's own name and by the path the citation must spell — in input
    order, with a blank line between files. A transcript excerpt is the unit's
    only text and carries no heading."""
    from facts_plan.build import _unit_text
    text_dir = tmp_path / "departments" / "cooking" / "attachments" / ".text"
    text_dir.mkdir(parents=True)
    (text_dir / "forms__tabdil.image.md").write_text("وزن مرغ\n", encoding="utf-8")
    (text_dir / "forms__enbar.image.md").write_text("موجودی انبار\n", encoding="utf-8")
    rels = ["departments/cooking/attachments/.text/forms__tabdil.image.md",
            "departments/cooking/attachments/.text/forms__enbar.image.md"]
    assert _unit_text(tmp_path, {"inputs": rels}) == (
        f"### forms/tabdil.image · {rels[0]}\n\nوزن مرغ\n\n"
        f"### forms/enbar.image · {rels[1]}\n\nموجودی انبار")

    (tmp_path / "meetings" / "transcripts").mkdir(parents=True)
    (tmp_path / "meetings" / "transcripts" / "m.txt").write_text(
        "یک\nدو\nسه\n", encoding="utf-8")
    assert _unit_text(tmp_path,
                      {"inputs": ["meetings/transcripts/m.txt#L1-L2"]}) == "یک\nدو"


def test_an_image_sidecars_heading_names_the_photo_itself(tmp_path):
    """Task H 2026-09-16: the unit reads the description, and looks at the photo
    for the table's structure — so the heading of an image sidecar also names
    the image, when the image is still there. A docx sidecar names none, and
    neither does a photo the estate has lost."""
    from facts_plan.build import _unit_text
    att = tmp_path / "departments" / "cooking" / "attachments"
    (att / "forms").mkdir(parents=True)
    (att / ".text").mkdir()
    (att / "forms" / "tabdil.jpg").write_bytes(b"\xff\xd8")
    (att / "forms" / "sanad.docx").write_bytes(b"PK")
    for name, body in (("forms__tabdil.image.md", "وزن مرغ"),
                       ("forms__sanad.txt", "سند"),
                       ("forms__gomshode.image.md", "گم‌شده")):
        (att / ".text" / name).write_text(body + "\n", encoding="utf-8")
    base = "departments/cooking/attachments/.text/"
    text = _unit_text(tmp_path, {"inputs": [f"{base}forms__tabdil.image.md",
                                            f"{base}forms__sanad.txt",
                                            f"{base}forms__gomshode.image.md"]})
    heads = [line for line in text.splitlines() if line.startswith("### ")]
    assert heads == [
        f"### forms/tabdil.image · {base}forms__tabdil.image.md"
        " · عکس: departments/cooking/attachments/forms/tabdil.jpg",
        f"### forms/sanad · {base}forms__sanad.txt",
        f"### forms/gomshode.image · {base}forms__gomshode.image.md"]


def test_no_item_unit_is_planned_and_the_coded_tab_is_still_a_record(tmp_path):
    """Spec 2026-09-16: the codes stay where the estate keeps them — the
    reference tab's own rows — and no candidate, unit or card is minted for
    them."""
    root = _tiny_estate(tmp_path)
    build(root, "cooking", tmp_path / "run", [])
    plan = json.loads((tmp_path / "run" / "plan.json").read_text(encoding="utf-8"))
    assert not [u for u in plan["units"] if u["type"] == "items"]
    skeleton = json.loads((tmp_path / "run" / "skeleton.json")
                          .read_text(encoding="utf-8"))
    assert not [c for c in skeleton["candidates"] if c["kind"] == "item"]
    assert [c for c in skeleton["candidates"]
            if c["kind"] == "record" and c["payload"].get("rows")]
