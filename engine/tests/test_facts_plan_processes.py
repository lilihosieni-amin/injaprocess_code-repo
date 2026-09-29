"""Spec 2026-09-29 §5.1 — the corrected processes as the file a unit reads whole."""
import json

from facts_plan.build import (
    MAX_LINE,
    process_file_map,
    process_index,
    render_process_file,
    write_process_files,
)
from test_facts_plan_fixture import _build


def _process(pid, nodes, edges=(), **over):
    doc = {"id": pid, "name": f"فرایند {pid}", "summary": "خلاصه",
           "nodes": nodes, "edges": list(edges)}
    doc.update(over)
    return doc


def _node(nid, label, **over):
    node = {"id": nid, "type": "activity", "label": label, "description": "",
            "actor": "", "icom": {}}
    node.update(over)
    return node


def _write(root, department, doc):
    directory = root / "departments" / department / "processes"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / f'{doc["id"]}.json').write_text(
        json.dumps(doc, ensure_ascii=False), encoding="utf-8")


def test_a_step_prints_its_actor_description_icom_and_next_steps():
    doc = _process("preparation-012", [
        _node("preparation-012-n039", "انتقال کنار شینسل خام به سردخانه",
              actor="مسئول لاین مرغ", description="در غذای پرسنل مصرف نمی‌شود.",
              icom={"inputs": ["کنار شینسل خام"], "controls": [],
                    "outputs": ["کنار شینسل منجمد"], "mechanisms": []}),
        _node("preparation-012-n040", "خارج کردن کنار شینسل منجمد")],
        edges=[{"from": "preparation-012-n039", "to": "preparation-012-n040",
                "label": "در صورت رسیدن روز پخت"},
               {"from": "preparation-012-n040", "to": "preparation-012-n999"}])
    text = render_process_file([doc])
    assert text.startswith("# preparation-012 · فرایند preparation-012\n\nخلاصه\n")
    assert "## preparation-012-n039 · انتقال کنار شینسل خام به سردخانه" in text
    assert "مجری: مسئول لاین مرغ" in text
    assert "در غذای پرسنل مصرف نمی‌شود." in text
    assert "ورودی: کنار شینسل خام  خروجی: کنار شینسل منجمد" in text
    assert "کنترل:" not in text                     # an empty ICOM list prints nothing
    assert "بعدی: «خارج کردن کنار شینسل منجمد» — در صورت رسیدن روز پخت" in text
    assert "بعدی: «preparation-012-n999»" in text    # a missing target prints its id


def test_a_long_description_is_folded_under_the_line_bound():
    doc = _process("cooking-001", [_node("cooking-001-n001", "گام",
                                         description="کلمه " * 800)])
    assert max(map(len, render_process_file([doc]).splitlines())) <= MAX_LINE


def test_one_file_per_department_and_tombstoned_or_broken_processes_skipped(tmp_path):
    _write(tmp_path, "preparation",
           _process("preparation-001", [_node("preparation-001-n001", "الف")]))
    _write(tmp_path, "preparation",
           _process("preparation-002", [_node("preparation-002-n001", "ب")],
                    tombstoned=True))
    _write(tmp_path, "warehouse",
           _process("warehouse-001", [_node("warehouse-001-n001", "ج")],
                    tombstoned=True))
    (tmp_path / "departments" / "preparation" / "processes"
     / "preparation-003.json").write_text("{", encoding="utf-8")
    run = tmp_path / "runs" / "facts" / "preparation" / "20260929-100000"
    files = write_process_files(tmp_path, run)
    assert files == {"preparation":
                     "runs/facts/preparation/20260929-100000/processes/preparation.md"}
    text = (run / "processes" / "preparation.md").read_text(encoding="utf-8")
    assert "preparation-001" in text and "preparation-002" not in text
    assert process_file_map(tmp_path, run) == files


def test_a_stale_department_file_is_removed_on_rewrite(tmp_path):
    run = tmp_path / "runs" / "facts" / "preparation" / "20260929-100000"
    (run / "processes").mkdir(parents=True)
    (run / "processes" / "warehouse.md").write_text("کهنه", encoding="utf-8")
    _write(tmp_path, "preparation",
           _process("preparation-001", [_node("preparation-001-n001", "الف")]))
    write_process_files(tmp_path, run)
    assert not (run / "processes" / "warehouse.md").exists()


def test_the_node_index_spans_every_department(tmp_path):
    _write(tmp_path, "preparation",
           _process("preparation-001", [_node("preparation-001-n001", "الف")]))
    _write(tmp_path, "warehouse",
           _process("warehouse-005", [_node("warehouse-005-n002", "ب")]))
    assert {(r["process"], r["node"]) for r in process_index(tmp_path)} == {
        ("preparation-001", "preparation-001-n001"),
        ("warehouse-005", "warehouse-005-n002")}
    assert [r["process"] for r in process_index(tmp_path, "warehouse")] == \
        ["warehouse-005"]


def test_a_form_units_input_lists_the_process_files_and_no_talk(tmp_path):
    def setup(root):
        _write(root, "cooking", _process("cooking-001", [_node("cooking-001-n001", "الف")]))
        _write(root, "warehouse", _process("warehouse-001", [_node("warehouse-001-n001", "ب")]))
    _root, run, _skeleton, plan = _build(tmp_path, setup=setup)
    unit = next(u for u in plan["units"] if u["type"] == "workbook")
    text = (run / "units" / unit["id"] / "input.md").read_text(encoding="utf-8")
    assert "## فرایندها" in text
    assert "runs/facts/cooking/20260906-101500/processes/cooking.md" in text
    # the fixture's registry names only cooking: another department falls back to its code
    assert "runs/facts/cooking/20260906-101500/processes/warehouse.md · warehouse" in text
    assert "گفت‌وگوهای مرتبط" not in text and "## گره‌های فرایند" not in text
    assert (run / "processes" / "warehouse.md").is_file()
    assert "talk" not in unit
    transcript = next(u for u in plan["units"] if u["type"] == "transcript")
    text = (run / "units" / transcript["id"] / "input.md").read_text(encoding="utf-8")
    assert "processes/cooking.md" in text and "processes/warehouse.md" not in text
