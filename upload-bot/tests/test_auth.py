from upload_bot.auth import is_allowed


def test_allowed_user_passes():
    assert is_allowed(42, 42) is True
    assert is_allowed("42", 42) is True         # telegram ids may arrive as int; be robust


def test_others_rejected():
    assert is_allowed(7, 42) is False
    assert is_allowed(42, None) is False
