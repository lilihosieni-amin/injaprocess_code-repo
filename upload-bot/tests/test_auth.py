from upload_bot.auth import is_allowed


def test_allowed_user_passes():
    ids = frozenset({42, 99})
    assert is_allowed(42, ids) is True
    assert is_allowed("42", ids) is True        # telegram ids may arrive as int-like
    assert is_allowed(99, ids) is True


def test_others_rejected():
    ids = frozenset({42})
    assert is_allowed(7, ids) is False
    assert is_allowed(42, frozenset()) is False
    assert is_allowed(None, ids) is False
