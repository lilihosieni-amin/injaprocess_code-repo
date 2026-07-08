from upload_bot.staging import discard, finalize, stage, staging_dir


def test_stage_writes_into_staging(data_root):
    p = stage(data_root, b"hello", hint="voice")
    assert p.parent == staging_dir(data_root)
    assert p.read_bytes() == b"hello"


def test_finalize_moves_atomically(data_root):
    p = stage(data_root, b"audio-bytes")
    dest = data_root / "meetings" / "audio" / "cooking-2026-07-06.ogg"
    out = finalize(p, dest)
    assert out == dest and dest.read_bytes() == b"audio-bytes"
    assert not p.exists()                      # moved, not copied


def test_finalize_creates_missing_parent(data_root):
    p = stage(data_root, b"x")
    dest = data_root / "departments" / "dining" / "attachments" / "new.pdf"
    finalize(p, dest)
    assert dest.exists()


def test_discard_removes_and_ignores_missing(data_root):
    p = stage(data_root, b"x")
    discard([p, data_root / ".staging" / "does-not-exist"])
    assert not p.exists()
