import pytest
from upload_bot.naming import normalize_date, voice_basename


def test_normalize_date_iso():
    assert normalize_date(" 2026-07-06 ") == "2026-07-06"


def test_normalize_date_rejects_bad():
    with pytest.raises(ValueError):
        normalize_date("06/07/2026")
    with pytest.raises(ValueError):
        normalize_date("2026-13-40")


def test_single_department(data_root):
    assert voice_basename(["cooking"], "2026-07-06", data_root) == "cooking-2026-07-06"


def test_multi_department_sorted_and_deduped(data_root):
    # order-independent + unique => deterministic
    assert voice_basename(["dining", "cooking", "cooking"], "2026-07-06",
                          data_root) == "cooking_dining-2026-07-06"


def test_same_day_collision_gets_02_then_03(data_root):
    audio = data_root / "meetings" / "audio"
    (audio / "cooking-2026-07-06.ogg").write_bytes(b"x")
    assert voice_basename(["cooking"], "2026-07-06", data_root) == "cooking-2026-07-06-02"
    (audio / "cooking-2026-07-06-02.ogg").write_bytes(b"x")
    assert voice_basename(["cooking"], "2026-07-06", data_root) == "cooking-2026-07-06-03"
