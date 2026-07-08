from upload_bot.session import FileBatch, VoiceUpload


def test_voice_toggle_and_ready():
    v = VoiceUpload()
    assert v.ready() is False
    v.date = "2026-07-06"
    assert v.ready() is False                   # needs >=1 department
    v.toggle_department("cooking")
    v.toggle_department("dining")
    assert v.departments == ["cooking", "dining"]
    v.toggle_department("cooking")              # toggling off
    assert v.departments == ["dining"]
    assert v.ready() is True


def test_file_batch_ready():
    b = FileBatch()
    assert b.ready() is False
    b.department = "cooking"
    assert b.ready() is False                   # needs >=1 file
    b.add_file("menu.pdf", "/tmp/staged-1")
    assert b.ready() is True
    assert b.files == [("menu.pdf", "/tmp/staged-1")]
