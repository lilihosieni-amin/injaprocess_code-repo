"""extract-attachment dispatcher + Vertex vision path (QF-30, Task 11).

Vertex is always stubbed here: a fake describer is injected through
`run_extract_attachment(..., describe=...)`, mirroring `test_transcribe.py`'s
`FakeTranscriber` pattern, so these tests need neither the `vertex` extra nor
credentials.
"""
import os

import extract_attachment.vision as vision
from extract_attachment import run_extract_attachment, text_dir
from extract_attachment.cli import main as cli_main


def _mk_attachments(root, dept):
    d = root / "departments" / dept / "attachments"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _write_docx(path, paragraphs):
    from docx import Document
    doc = Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    doc.save(str(path))


class FakeDescriber:
    """Injectable stand-in for vision.describe — counts calls, ignores file bytes."""

    def __init__(self, text="نمونه\nhandwriting: no"):
        self.calls = 0
        self.text = text
        self.seen_kinds = []

    def __call__(self, path, kind):
        self.calls += 1
        self.seen_kinds.append(kind)
        return self.text


def test_unknown_extension_skips_and_exit_3(data_root, capsys):
    adir = _mk_attachments(data_root, "dining")
    _write_docx(adir / "a.docx", ["شرح شغل"])
    (adir / "b.xyz").write_bytes(b"???")
    rc = cli_main(["dining"])
    out, err = capsys.readouterr()
    assert "departments/dining/attachments/.text/a.txt" in out
    assert "skipped b.xyz" in err
    assert rc == 3


def test_xlsx_skipped_with_workbook_reason(data_root, capsys):
    adir = _mk_attachments(data_root, "dining")
    (adir / "Ledger.xlsx").write_bytes(b"pk\x03\x04fake")
    rc = cli_main(["dining"])
    err = capsys.readouterr().err
    assert "skipped Ledger.xlsx: workbooks are dumped by dump-workbook from " \
           "attachments/sheets/" in err
    assert rc == 3


def test_vertex_path_writes_image_md_and_asserts_handwriting_line(data_root):
    adir = _mk_attachments(data_root, "dining")
    (adir / "photo.jpg").write_bytes(b"\xff\xd8\xff\xe0fake-jpeg")
    fake = FakeDescriber(text="سند نمونه\nhandwriting: no")
    ok, errors = run_extract_attachment("dining", root=data_root, describe=fake)
    assert errors == []
    assert fake.calls == 1 and fake.seen_kinds == ["jpg"]
    dst = text_dir(data_root, "dining") / "photo.image.md"
    assert dst.exists()
    body = dst.read_text(encoding="utf-8")
    assert body.endswith("handwriting: no")
    assert ok == ["departments/dining/attachments/.text/photo.image.md"]


def test_touched_but_unchanged_docx_not_reconverted(data_root):
    adir = _mk_attachments(data_root, "dining")
    src = adir / "host.docx"
    _write_docx(src, ["شرح شغل"])

    class CountingConvert:
        def __init__(self):
            self.calls = 0

        def __call__(self, path):
            self.calls += 1
            return "متن\n"

    conv = CountingConvert()
    run_extract_attachment("dining", root=data_root, convert=conv)
    dst = text_dir(data_root, "dining") / "host.txt"
    first_mtime = dst.stat().st_mtime
    future = first_mtime + 10
    os.utime(src, (future, future))          # touched, content unchanged
    run_extract_attachment("dining", root=data_root, convert=conv)
    assert conv.calls == 1                    # hash gate: not reconverted
    assert dst.stat().st_mtime == first_mtime


def test_reconverts_when_docx_content_changes(data_root):
    adir = _mk_attachments(data_root, "dining")
    src = adir / "host.docx"
    _write_docx(src, ["شرح شغل نسخه یک"])

    class CountingConvert:
        def __init__(self):
            self.calls = 0

        def __call__(self, path):
            self.calls += 1
            return f"متن {self.calls}\n"

    conv = CountingConvert()
    run_extract_attachment("dining", root=data_root, convert=conv)
    _write_docx(src, ["شرح شغل نسخه دو، متن متفاوت"])   # real content change
    run_extract_attachment("dining", root=data_root, convert=conv)
    assert conv.calls == 2


def test_path_flag_roots_elsewhere(data_root):
    sheets = data_root / "attachments" / "sheets"
    sheets.mkdir(parents=True)
    (sheets / "form.pdf").write_bytes(b"%PDF-1.4 fake")
    fake = FakeDescriber(text="فرم نمونه\nhandwriting: yes")
    ok, errors = run_extract_attachment(None, root=data_root, path="attachments/sheets",
                                         describe=fake)
    assert errors == []
    assert fake.calls == 1 and fake.seen_kinds == ["pdf"]
    dst = sheets / ".text" / "form.pdf.md"
    assert dst.exists()
    assert ok == ["attachments/sheets/.text/form.pdf.md"]


def test_missing_vertex_extra_reports_skip(monkeypatch, data_root, capsys):
    adir = _mk_attachments(data_root, "dining")
    (adir / "form.pdf").write_bytes(b"%PDF-1.4 fake")
    monkeypatch.setattr(vision, "AVAILABLE", False)
    rc = cli_main(["dining"])
    err = capsys.readouterr().err
    assert "skipped form.pdf: vertex extra not installed" in err
    assert rc == 3


def test_passthrough_extensions_are_neither_ok_nor_skipped(data_root, capsys):
    adir = _mk_attachments(data_root, "dining")
    for name in ("notes.csv", "index.md", "raw.txt", "Code.gs"):
        (adir / name).write_bytes(b"content")
    ok, errors = run_extract_attachment("dining", root=data_root)
    assert ok == [] and errors == []
    out, err = capsys.readouterr()
    assert out == "" and err == ""
    assert not (adir / ".text").exists()


def test_cli_neither_department_nor_path_is_precondition_failure(data_root, capsys):
    rc = cli_main([])
    err = capsys.readouterr().err
    assert rc == 2
    assert err.strip() != ""


def test_cli_both_department_and_path_is_precondition_failure(data_root, capsys):
    rc = cli_main(["dining", "--path", "attachments/sheets"])
    assert rc == 2


def test_all_convertible_extensions_are_case_insensitive(data_root):
    adir = _mk_attachments(data_root, "dining")
    (adir / "SCAN.PNG").write_bytes(b"\x89PNGfake")
    fake = FakeDescriber()
    ok, errors = run_extract_attachment("dining", root=data_root, describe=fake)
    assert errors == []
    assert fake.seen_kinds == ["png"]
    assert ok == ["departments/dining/attachments/.text/SCAN.image.md"]
