"""§7's `facts-plan build` fixture — the frozen cooking estate.

`fixtures/facts-plan/` is the re-dumped estate copied byte for byte and
`expected.json` is what the landed engine made of it; the only hand edits are
the two `twin_of` lines the data repo's manifest does not carry yet
(`fried → sokhari`, `gozaresh_naharkhoran → gozaresh_markazi`), without which
`plan_units` exits 2. `fixtures/facts-plan/README.md` has the rest.
"""
import json
import pathlib
import shutil

from facts_plan.build import _is_mirror, build, load_estate

FIX = pathlib.Path(__file__).parent / "fixtures" / "facts-plan"
EXPECTED = json.loads((FIX / "expected.json").read_text(encoding="utf-8"))


def _build(tmp_path):
    root = tmp_path / "data"
    shutil.copytree(FIX / "dump", root / "attachments" / "sheets" / ".dump")
    # The `.gs` bodies the manifest points at sit beside `.dump`, not inside
    # it: they are what makes the two script rules and the estate-wide
    # table-reader closure (§2.3) — without them the build is a different one.
    shutil.copytree(FIX / "scripts", root / "attachments" / "sheets",
                    dirs_exist_ok=True)
    (root / "attachments" / "sheets" / "manifest.json").write_text(
        (FIX / "manifest.json").read_text(encoding="utf-8"), encoding="utf-8")
    (root / "meetings" / "transcripts").mkdir(parents=True)
    (root / "meetings" / "transcripts" / "transcript.txt").write_text(
        (FIX / "transcript.txt").read_text(encoding="utf-8"), encoding="utf-8")
    # The store the run starts from: the estate's `units` record and nothing
    # else. `apply` refuses a unit symbol no row of it declares, and `build`
    # reads its row keys as the run's `unit_symbols[]`.
    shutil.copytree(FIX / "facts", root / "facts")
    (root / "departments" / "cooking" / "processes").mkdir(parents=True)
    # `build` never reads the registry; `gate_b` and `report` name the
    # department by it, so the acceptance run needs it here.
    (root / "departments" / "registry.json").write_text(json.dumps(
        {"departments": [{"code": "cooking", "name": "آشپزخانه"}]},
        ensure_ascii=False), encoding="utf-8")
    run = root / "runs" / "facts" / "cooking" / "20260906-101500"
    run.mkdir(parents=True)
    build(root, "cooking", run, ["transcript"])
    return root, run, json.loads((run / "skeleton.json").read_text(encoding="utf-8")), \
        json.loads((run / "plan.json").read_text(encoding="utf-8"))


def test_candidate_and_issue_counts_match_the_frozen_expectation(tmp_path):
    _root, _run, skeleton, _plan = _build(tmp_path)
    kinds = {}
    for c in skeleton["candidates"]:
        kinds[c["kind"]] = kinds.get(c["kind"], 0) + 1
    assert kinds == EXPECTED["candidates"]
    issues = {}
    for i in skeleton["issues"]:
        issues[i["kind"]] = issues.get(i["kind"], 0) + 1
    assert issues == EXPECTED["issues"]
    assert len(skeleton["imports"]) == EXPECTED["imports"]


def test_mirror_tabs_mint_no_rule_and_every_edge_resolved(tmp_path):
    root, _run, skeleton, _plan = _build(tmp_path)
    assert all("IMPORT_FROM_SHEET" not in json.dumps(c["payload"],
                                                     ensure_ascii=False)
               for c in skeleton["candidates"] if c["kind"] == "rule")
    assert all(edge["source"].get("ref") or edge["source"].get("spreadsheetId")
               for edge in skeleton["imports"])
    # §2.3's edge is one (mirror tab, consumer instance) pair, so the two
    # numbers differ: a mirror read by three tabs is one tab and three edges.
    estate = load_estate(root)
    mirrors = sum(1 for _sid, dump in sorted(estate.items())
                  if "cooking" in (dump["row"].get("departments") or [])
                  for tab in sorted(dump["sheets"])
                  if _is_mirror([r for r in dump["formulas"]
                                 if r.get("sheet") == tab]))
    assert mirrors == EXPECTED["mirror_tabs"]
    assert len(skeleton["imports"]) == EXPECTED["imports"]


def test_line_pairs_are_one_unit_each_and_the_report_books_share_one(tmp_path):
    _root, _run, _skeleton, plan = _build(tmp_path)
    ids = [u["id"] for u in plan["units"]]
    assert ids == [u["id"] for u in EXPECTED["units"]]
    assert sum(1 for i in ids if i.startswith("u-wb-")) == \
        sum(1 for u in EXPECTED["units"] if u["type"] == "workbook")


def test_every_unit_is_under_both_budgets_and_the_line_bound(tmp_path):
    _root, run, _skeleton, plan = _build(tmp_path)
    limits = EXPECTED["estimator"]
    for unit in plan["units"]:
        text = (run / "units" / unit["id"] / "input.md").read_text(encoding="utf-8")
        lines = text.split("\n")
        assert unit["est_tokens_in"] <= limits["in_budget"], unit["id"]
        assert unit["est_tokens_out"] <= limits["out_budget"], unit["id"]
        assert len(lines) <= limits["max_lines"], unit["id"]
        assert max(map(len, lines)) <= limits["max_line"], unit["id"]


def test_ids_are_deterministic_across_two_builds(tmp_path):
    _root, _run, first, _plan = _build(tmp_path / "a")
    _root, _run, second, _plan = _build(tmp_path / "b")
    assert sorted(c["id"] for c in first["candidates"]) == \
        EXPECTED["candidate_ids"]
    assert [c["id"] for c in first["candidates"]] == \
        [c["id"] for c in second["candidates"]]


def test_plan_goes_stale_when_a_dump_changes(tmp_path):
    from facts_plan.cli import status
    root, run, _skeleton, _plan = _build(tmp_path)
    assert status(root, run)["plan_stale"] is False
    sheets = next((root / "attachments" / "sheets" / ".dump").glob("*/sheets.json"))
    sheets.write_text(sheets.read_text(encoding="utf-8") + " ", encoding="utf-8")
    assert status(root, run)["plan_stale"] is True
