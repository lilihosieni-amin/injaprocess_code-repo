import os

from extract_attachment import (
    cache_path,
    find_attachments,
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


def test_reconverts_when_docx_content_changes(data_root):
    # Task 11 (QF-30): the cache moved from an mtime gate to a hash gate, so a
    # merely-touched file with unchanged bytes is no longer reconverted — see
    # test_touched_but_unchanged_docx_not_reconverted in
    # test_extract_attachment_dispatch.py for that half of the contract. This
    # test keeps the other half: real content changes still trigger reconversion.
    adir = _mk_attachments(data_root, "dining")
    src = adir / "host.docx"
    src.write_bytes(b"dummy")
    conv = CountingConvert()
    run_extract_attachment("dining", root=data_root, convert=conv)
    dst = text_dir(data_root, "dining") / "host.txt"
    future = dst.stat().st_mtime + 10
    os.utime(src, (future, future))
    src.write_bytes(b"dummy, but different now")   # real content change, not just mtime
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
    # Task 11 (QF-30): exit 1 retired — a per-file failure is an advisory skip (exit 3),
    # not the CLI's old undifferentiated non-zero.
    assert rc == 3
    assert "bad.docx" in err


def test_find_attachments_walks_subdirectories_and_skips_the_rest(data_root):
    """I2 — a form filed in a subdirectory is neither read nor named unread as
    long as the walk stops at the top level. `sheets/` belongs to
    `dump-workbook`, `.text/` is the cache, and a dot-name is nobody's form."""
    adir = _mk_attachments(data_root, "dining")
    (adir / "x.docx").write_bytes(b"x")
    (adir / "forms").mkdir()
    (adir / "forms" / "y.pdf").write_bytes(b"x")
    (adir / "sheets").mkdir()
    (adir / "sheets" / "z.xlsx").write_bytes(b"x")
    (adir / ".text").mkdir()
    (adir / ".text" / "y.pdf.md").write_bytes(b"x")
    (adir / ".hidden").mkdir()
    (adir / ".hidden" / "w.docx").write_bytes(b"x")
    (adir / ".gitkeep").write_bytes(b"")
    assert [p.relative_to(adir).as_posix() for p in find_attachments(adir)] == [
        "forms/y.pdf", "x.docx"]


def test_cache_path_flattens_a_nested_source(data_root):
    """One derivation of the cache location, for every reader of it."""
    adir = _mk_attachments(data_root, "dining")
    assert cache_path(adir, adir / "forms" / "y.pdf") == (
        adir / ".text" / "forms__y.pdf.md")
    assert cache_path(adir, adir / "host.docx") == adir / ".text" / "host.txt"


def test_a_nested_docx_is_converted_under_its_flattened_name(data_root):
    adir = _mk_attachments(data_root, "dining")
    (adir / "forms").mkdir()
    _write_docx(adir / "forms" / "tahvil.docx", ["شرح شغل"])
    ok, errors = run_extract_attachment("dining", root=data_root,
                                        convert=CountingConvert())
    assert errors == []
    assert ok == ["departments/dining/attachments/.text/forms__tahvil.txt"]


def test_an_unreadable_nested_file_is_reported_by_its_relative_path(data_root):
    adir = _mk_attachments(data_root, "dining")
    (adir / "forms").mkdir()
    (adir / "forms" / "plan.xyz").write_bytes(b"x")
    ok, errors = run_extract_attachment("dining", root=data_root)
    assert ok == []
    assert [name for name, _ in errors] == ["forms/plan.xyz"]
