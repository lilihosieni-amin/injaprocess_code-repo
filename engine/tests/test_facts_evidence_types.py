"""§3.8 — one paper form per kind of evidence, through the gate that closed.

The 2026-09-07 run wrote two photographed paper forms as records with invented
keys (`blank_master`, `header_fields`, `signatures`, `sections`) and no
`location`, and Stage V refused them after both the unit and the reviewer had
spent their attempts. Invariant I1 says that refusal belongs at the unit's
gate: whatever a unit writes, from whatever evidence — a `.docx`, a `.pdf`, an
image, or a form only ever spoken about — is held to the same per-entry
contract `merge facts apply` enforces.

So: five forms, five kinds of evidence, one shape. Each one through
`validate facts-unit` (must pass), each one deliberately broken (must fail at
that gate, naming the field), and all four through `assemble` and `simulate`
(must not be refused).
"""
import copy
import json

import pytest
from facts_plan.assemble import assemble, validate_unit
from facts_plan.build import build
from facts_helpers import _run_dir, _seed_units, _units_delta, _write
from facts_plan_helpers import estate
from merge_facts.apply import simulate

#: The five forms, in the evidence each arrived on: a `.docx`, a `.pdf`, an
#: image, a `.docx` filed one directory down, and a transcript line. Every one
#: is a paper record with the closed `location` of §3.3.
FORMS = [
    ("form_tahvil_anbar", "فرم تحویل کالا از انبار",
     "فرم کاغذی که هنگام تحویل هر قلم از انبار به لاین پر می‌شود و مقدار "
     "تحویلی و تحویل‌گیرنده را ثبت می‌کند.",
     {"kept_at": "دفتر انبار", "holder": "سرپرست انبار"},
     [{"key": "tarikh", "title": "تاریخ", "type": "date"},
      {"key": "qalam", "title": "نام کالا", "type": "string"},
      {"key": "meqdar", "title": "مقدار", "type": "number", "unit": "kg"},
      {"key": "tahvil_girande", "title": "تحویل‌گیرنده", "type": "string"}]),
    ("form_zayeat", "فرم ثبت ضایعات روزانه",
     "فرم کاغذی که مقدار دورریز هر قلم و علت آن را در پایان هر روز ثبت می‌کند.",
     {"kept_at": "کلاسور آشپزخانه", "holder": "سرآشپز"},
     [{"key": "tarikh", "title": "تاریخ", "type": "date"},
      {"key": "qalam", "title": "نام کالا", "type": "string"},
      {"key": "meqdar_dorriz", "title": "مقدار دورریز", "type": "number",
       "unit": "kg"},
      {"key": "elat", "title": "علت", "type": "string"}]),
    ("form_shomaresh_yakhchal", "فرم شمارش یخچال",
     "فرم کاغذی که تعداد هر قلم داخل یخچال را در هر شیفت ثبت می‌کند.",
     {"kept_at": "در یخچال", "holder": "مسئول شیفت"},
     [{"key": "qalam", "title": "نام کالا", "type": "string"},
      {"key": "tedad", "title": "تعداد", "type": "number", "unit": "pcs"}]),
    ("form_anbargardani", "فرم انبارگردانی ماهانه",
     "فرم کاغذی که موجودی شمارش‌شدهٔ هر قلم و اختلاف آن با دفتر را ماهانه "
     "ثبت می‌کند.",
     {"kept_at": "دفتر انبار", "holder": "سرپرست انبار"},
     [{"key": "qalam", "title": "نام کالا", "type": "string"},
      {"key": "mojudi", "title": "موجودی شمارش‌شده", "type": "number",
       "unit": "kg"},
      {"key": "ekhtelaf", "title": "اختلاف", "type": "number", "unit": "kg"}]),
    ("form_marjui", "فرم مرجوعی کالا به تأمین‌کننده",
     "فرم کاغذی که مقدار برگشتی هر قلم به تأمین‌کننده و علت مرجوعی را ثبت می‌کند.",
     {"kept_at": "زونکن دفتر انبار", "holder": "سرپرست انبار"},
     [{"key": "tarikh", "title": "تاریخ", "type": "date"},
      {"key": "qalam", "title": "نام کالا", "type": "string"},
      {"key": "meqdar_bargashti", "title": "مقدار برگشتی", "type": "number",
       "unit": "kg"},
      {"key": "elat_marjui", "title": "علت مرجوعی", "type": "string"}]),
]


#: Where each form's evidence is, and so which unit writes it (F4): the unit
#: type shown the evidence, a phrase of the evidence as that unit's `input.md`
#: carries it, and the source the assembled entry must cite for it.
TEXT = "departments/cooking/attachments/.text/"
EVIDENCE = {
    "form_tahvil_anbar": ("attachment", "فرم تحویل کالا از انبار",
                          ("docx", TEXT + "فرم-تحویل-انبار.txt")),
    "form_zayeat": ("attachment", "فرم ثبت ضایعات روزانه",
                    ("pdf", TEXT + "فرم-ضایعات.pdf.md")),
    "form_shomaresh_yakhchal": ("attachment", "عکس یک فرم کاغذی",
                                ("photo", TEXT + "فرم-شمارش-یخچال.image.md")),
    # I2 — one directory down
    "form_anbargardani": ("attachment", "فرم انبارگردانی ماهانه",
                          ("docx", TEXT + "forms__فرم-انبارگردانی.txt")),
    "form_marjui": ("transcript", "فرم کاغذی هم داریم برای مرجوعی",
                    ("voice", "meetings/transcripts/cooking-1405-05-26.txt")),
}


def _record(form):
    key, title, statement, location, fields = form
    return {"kind": "record", "key": key, "title": title,
            "statement": statement,
            "data": {"medium": "paper", "role": "log", "location": location,
                     "cadence": "daily", "fields": copy.deepcopy(fields),
                     "filled_by": "انباردار"}}


def _run(tmp_path):
    """The mini estate with its attachment set and the transcript that names
    the fourth form, built, seeded, and ready for a unit's output."""
    from fixtures.facts_plan.make_dump import TRANSCRIPT, make_attachments
    root = tmp_path / "data"
    root.mkdir()
    estate(root)
    make_attachments(root)
    transcripts = root / "meetings" / "transcripts"
    transcripts.mkdir(parents=True)
    (transcripts / "cooking-1405-05-26.txt").write_text(TRANSCRIPT,
                                                        encoding="utf-8")
    (root / "departments" / "cooking" / "processes").mkdir(parents=True,
                                                           exist_ok=True)
    (root / "departments" / "registry.json").write_text(json.dumps(
        {"departments": [{"code": "cooking", "name": "آشپزخانه"}]},
        ensure_ascii=False), encoding="utf-8")
    (root / "facts").mkdir()
    _seed_units(root)                        # the `units` record `kg`/`pcs` need
    run = root / "runs" / "facts" / "cooking" / "20260907-101500"
    run.mkdir(parents=True)
    build(root, "cooking", run, ["cooking-1405-05-26"])
    plan = json.loads((run / "plan.json").read_text(encoding="utf-8"))
    # F4 — the attachments are a unit of their own, so a form is written by the
    # unit that was shown its evidence: `{unit type: unit id}`, one of each.
    units = {}
    for unit in plan["units"]:
        if unit["type"] in ("transcript", "attachment"):
            assert unit["type"] not in units, "the mini estate fits one of each"
            units[unit["type"]] = unit["id"]
    return root, run, units


def _writer(units, form):
    """The unit that writes `form` — the one shown its evidence."""
    return units[EVIDENCE[form[0]][0]]


def _out(run, unit_id, entries, attempt=1):
    path = run / "units" / unit_id / f"out.{attempt}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(
        {"schema_version": 1, "unit": unit_id, "attempt": attempt,
         "decisions": [], "new": entries}, ensure_ascii=False), encoding="utf-8")
    return path


@pytest.mark.parametrize("form", FORMS, ids=[f[0] for f in FORMS])
def test_the_unit_that_writes_a_form_is_shown_its_evidence_and_the_shape(
        tmp_path, form):
    """The unit that writes a paper form — from what was said (a transcript
    unit) or from a photo or a document (an attachment unit, F4) — has that
    form's evidence in its own input, and §3.2 says it carries the contract."""
    root, run, units = _run(tmp_path)
    text = (run / "units" / _writer(units, form) / "input.md").read_text(
        encoding="utf-8")
    assert EVIDENCE[form[0]][1] in text
    assert "Shape card" in text
    assert "medium=paper: holder*، kept_at*" in text
    # the card's enums are rendered in the agent's language, not the brief's
    assert "* medium: یکی از: sheet | paper | external | native" in text


def test_the_unreadable_file_reaches_no_unit_and_is_named_to_the_owner(
        tmp_path):
    root, run, _units = _run(tmp_path)
    for path in (run / "units").glob("*/input.md"):
        assert "چیدمان-انبار" not in path.read_text(encoding="utf-8"), path
    # I2 — invisible to the unit, visible to the owner, by its own file name.
    issues = json.loads(
        (run / "skeleton.json").read_text(encoding="utf-8"))["issues"]
    unread = [i for i in issues if i["kind"] == "unread_attachment"]
    assert [i["target"] for i in unread] == ["چیدمان-انبار.xyz"]


@pytest.mark.parametrize("form", FORMS, ids=[f[0] for f in FORMS])
def test_each_paper_form_passes_the_unit_gate(tmp_path, form):
    """I1 — the shape is one shape, whatever the evidence was."""
    root, run, units = _run(tmp_path)
    assert validate_unit(root, run, _out(run, _writer(units, form),
                                         [_record(form)])) == []


@pytest.mark.parametrize("form", FORMS, ids=[f[0] for f in FORMS])
@pytest.mark.parametrize("break_it,names", [
    ("type", "type"), ("signatures", "signatures"), ("location", "location")],
    ids=["a text column", "an invented key", "an empty location"])
def test_a_wrong_shape_is_refused_at_the_unit_gate_by_field(tmp_path, form,
                                                            break_it, names):
    """The three shapes the 2026-09-07 run actually wrote. Each must be refused
    HERE — at the unit's own gate, within its two attempts — and the message
    must name the field, not dump the entry (§3.4)."""
    root, run, units = _run(tmp_path)
    entry = _record(form)
    if break_it == "type":
        entry["data"]["fields"][0]["type"] = "text"
    elif break_it == "signatures":
        entry["data"]["signatures"] = [{"role": "انباردار", "sections": []}]
    else:
        entry["data"]["location"] = {}
    problems = validate_unit(root, run, _out(run, _writer(units, form),
                                             [entry]))
    assert problems, f"{break_it} passed the gate"
    joined = "\n".join(problems)
    assert names in joined, joined
    assert len(joined) < 2000, "the gate dumped the entry instead of the field"


def test_every_form_survives_assemble_and_simulate(tmp_path):
    """The whole of I1: what passes the unit's gate is what `apply` accepts. A
    per-entry refusal after this point is the defect §2 names."""
    root, run, units = _run(tmp_path)
    for kind, unit_id in units.items():
        _out(run, unit_id, [_record(f) for f in FORMS
                            if EVIDENCE[f[0]][0] == kind])

    assemble(root, run)

    # and the owner is told, at Gate B, about the file nothing could read.
    gate = (run / "gate-b.md").read_text(encoding="utf-8")
    assert "فایل‌هایی که در این اجرا خوانده نشدند" in gate
    assert "چیدمان-انبار.xyz" in gate

    delta = json.loads((run / "facts-delta.json").read_text(encoding="utf-8"))
    records = [e for e in delta["entries"] if e["kind"] == "record"
               and e["data"]["medium"] == "paper"]
    assert sorted(e["key"] for e in records) == sorted(f[0] for f in FORMS)
    # each form cites its own evidence as what it is: the nested `.docx`, the
    # pdf and the photo from the attachment unit, the spoken form as voice —
    # and the spoken one cites no file it was never shown.
    for entry in records:
        cited = {(c["type"], c["ref"]) for c in entry.get("source") or []}
        assert EVIDENCE[entry["key"]][2] in cited, (entry["key"], cited)
        if EVIDENCE[entry["key"]][0] == "transcript":
            assert {kind for kind, _ in cited} == {"voice"}, cited
        else:
            assert "voice" not in {kind for kind, _ in cited}, cited
    assert all(set(e["data"]["location"]) == {"kept_at", "holder"}
               for e in records)
    _store_after, problems = simulate(root, run / "facts-delta.json",
                                      _run_dir(root, "20260907-110000"))
    assert problems == []
