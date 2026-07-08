from upload_bot.attachments import attachment_dest, sanitize_filename


def test_sanitize_strips_path_and_unsafe():
    assert sanitize_filename("/etc/pa ss?.pdf") == "pa_ss_.pdf"


def test_sanitize_keeps_persian():
    assert sanitize_filename("قرارداد.pdf") == "قرارداد.pdf"


def test_dest_in_department_attachments(data_root):
    dest = attachment_dest("cooking", "menu.pdf", data_root)
    assert dest == data_root / "departments" / "cooking" / "attachments" / "menu.pdf"


def test_dest_decollides(data_root):
    d = data_root / "departments" / "cooking" / "attachments"
    (d / "menu.pdf").write_bytes(b"x")
    assert attachment_dest("cooking", "menu.pdf", data_root) == d / "menu-2.pdf"
    (d / "menu-2.pdf").write_bytes(b"x")
    assert attachment_dest("cooking", "menu.pdf", data_root) == d / "menu-3.pdf"
