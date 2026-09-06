"""The v2 §17 cooking acceptance, re-expressed over three frozen unit outputs
(v3 §7): the fixture's own build, the units' documents folded in by `assemble`,
then `apply` and the owner's `report.md`."""
import json
import pathlib
import re

from facts_plan.assemble import assemble, report
from test_facts_plan_fixture import _build

UNITS = pathlib.Path(__file__).parent / "fixtures" / "facts-plan" / "units"

#: An instance key, a skeleton or `new[]` handle, a unit id, a path — none of
#: them may reach a file the owner reads (data-repo § Language, §2.7).
LEAK = re.compile(r"__s|S-|N-|u-|/")


def _delta(tmp_path):
    root, run, _skeleton, plan = _build(tmp_path)
    for path in UNITS.glob("*.json"):
        target = run / "units" / path.stem
        target.mkdir(parents=True, exist_ok=True)
        (target / "out.1.json").write_text(path.read_text(encoding="utf-8"),
                                           encoding="utf-8")
    assemble(root, run)
    return root, run, json.loads((run / "facts-delta.json")
                                 .read_text(encoding="utf-8"))


def test_bacon_carries_its_pack_units(tmp_path):
    _root, _run, delta = _delta(tmp_path)
    bacon = next(e for e in delta["entries"]
                 if e["kind"] == "item" and "بیکن" in e["title"])
    assert [u["pack_unit"] for u in bacon["data"]["units"]] == ["pack"]
    assert bacon["data"]["units"][0]["factor_to_base"] > 0


def test_nine_items_are_tracked_false(tmp_path):
    _root, _run, delta = _delta(tmp_path)
    untracked = [e for e in delta["entries"] if e["kind"] == "item"
                 and any(t.get("value") is False
                         for t in e["data"].get("tracked") or [])]
    assert len(untracked) == 9


def test_the_night_stock_record_carries_movement_and_the_day_boundary(tmp_path):
    _root, _run, delta = _delta(tmp_path)
    record = next(e for e in delta["entries"] if e["kind"] == "record"
                  and e["data"].get("day_boundary"))
    assert record["data"]["day_boundary"] == "01:15"
    assert set(record["data"]["movement"]) == {"from", "to", "reason"}


def test_the_delta_validates_and_gate_b_is_owner_ready(tmp_path):
    from engine_common import validate
    _root, run, delta = _delta(tmp_path)
    validate("facts-delta.schema.json", delta)
    text = (run / "gate-b.md").read_text(encoding="utf-8")
    assert "تأیید می‌کنید؟" in text
    for banned in ("T-", "S-", "u-wb", "/", "merge "):
        assert banned not in text
    # The engine's own issue descriptions are printed verbatim here (§2.7), so
    # the leak check is over the whole file, line by line.
    for line in text.splitlines():
        assert not LEAK.search(line), line


def test_apply_then_the_report_the_owner_reads(tmp_path):
    from merge_facts.apply import apply
    root, run, delta = _delta(tmp_path)
    applied = apply(root, run / "facts-delta.json", run)
    assert len(applied["created"]) == len(delta["entries"])
    text = report(root, run).read_text(encoding="utf-8")
    assert "گزارش پایان اجرا — آشپزخانه" in text
    assert "بازبینی اجرا نشد." in text          # no review ran
    for banned in ("F-000", "T-", "merge ", "cooking"):
        assert banned not in text
    for line in text.splitlines():
        assert not LEAK.search(line), line
