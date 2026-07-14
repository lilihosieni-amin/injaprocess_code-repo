import os

from extract_attachment import (
    find_docx,
    run_extract_attachment,
    text_dir,
)
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


class CountingConvert:
    """Injectable stand-in for docx_to_text — counts calls, ignores file bytes."""
    def __init__(self, text="متن نمونه"):
        self.calls = 0
        self.text = text

    def __call__(self, path):
        self.calls += 1
        return self.text + "\n"


def test_real_docx_converts_to_text(data_root):
    adir = _mk_attachments(data_root, "dining")
    _write_docx(adir / "host.docx", ["شرح شغل مهماندار", "وظیفه: پذیرش مشتری"])
    ok, errors = run_extract_attachment("dining", root=data_root)
    assert errors == []
    txt = text_dir(data_root, "dining") / "host.txt"
    assert txt.exists()
    body = txt.read_text(encoding="utf-8")
    assert "شرح شغل مهماندار" in body and "پذیرش مشتری" in body
    assert ok == ["departments/dining/attachments/.text/host.txt"]


def test_idempotent_reuses_cache(data_root):
    adir = _mk_attachments(data_root, "dining")
    (adir / "host.docx").write_bytes(b"dummy")
    conv = CountingConvert()
    run_extract_attachment("dining", root=data_root, convert=conv)
    dst = text_dir(data_root, "dining") / "host.txt"
    first_mtime = dst.stat().st_mtime
    run_extract_attachment("dining", root=data_root, convert=conv)  # cache newer than src
    assert conv.calls == 1                      # not re-converted
    assert dst.stat().st_mtime == first_mtime   # not rewritten


def test_reconverts_when_docx_is_newer(data_root):
    adir = _mk_attachments(data_root, "dining")
    src = adir / "host.docx"
    src.write_bytes(b"dummy")
    conv = CountingConvert()
    run_extract_attachment("dining", root=data_root, convert=conv)
    dst = text_dir(data_root, "dining") / "host.txt"
    # make the source newer than the cache
    future = dst.stat().st_mtime + 10
    os.utime(src, (future, future))
    run_extract_attachment("dining", root=data_root, convert=conv)
    assert conv.calls == 2                      # re-converted


def test_empty_department_returns_empty(data_root):
    _mk_attachments(data_root, "dining")        # dir exists, no .docx
    ok, errors = run_extract_attachment("dining", root=data_root)
    assert ok == [] and errors == []


def test_missing_attachments_dir_returns_empty(data_root):
    ok, errors = run_extract_attachment("nosuchdept", root=data_root)
    assert ok == [] and errors == []


def test_corrupt_docx_is_recorded_as_error(data_root):
    adir = _mk_attachments(data_root, "dining")
    (adir / "bad.docx").write_bytes(b"not a real docx")

    def boom(path):
        raise ValueError("bad zip")

    ok, errors = run_extract_attachment("dining", root=data_root, convert=boom)
    assert ok == []
    assert errors == [("bad.docx", "bad zip")]


def test_find_docx_sorted_and_skips_text_dir(data_root):
    adir = _mk_attachments(data_root, "dining")
    (adir / "b.docx").write_bytes(b"x")
    (adir / "a.docx").write_bytes(b"x")
    (adir / ".gitkeep").write_bytes(b"")
    (adir / ".text").mkdir()
    (adir / ".text" / "old.docx").write_bytes(b"x")   # must NOT be picked up
    names = [p.name for p in find_docx(data_root, "dining")]
    assert names == ["a.docx", "b.docx"]


def test_cli_prints_ok_paths_and_exits_zero(data_root, capsys):
    adir = _mk_attachments(data_root, "dining")
    _write_docx(adir / "host.docx", ["شرح شغل"])
    rc = cli_main(["dining"])
    out = capsys.readouterr()
    assert rc == 0
    assert out.out.strip() == "departments/dining/attachments/.text/host.txt"


def test_cli_reports_errors_and_exits_nonzero(data_root, capsys, monkeypatch):
    adir = _mk_attachments(data_root, "dining")
    (adir / "bad.docx").write_bytes(b"nope")

    def boom(path):
        raise ValueError("bad zip")

    monkeypatch.setattr("extract_attachment.cli.docx_to_text", boom, raising=False)
    rc = cli_main(["dining"])
    err = capsys.readouterr().err
    assert rc == 1
    assert "bad.docx" in err
