import pytest
from upload_bot.naming import normalize_date, voice_basename


def test_normalize_date_shamsi_latin():
    assert normalize_date(" 1405-04-19 ") == "1405-04-19"


def test_normalize_date_accepts_persian_digits():
    assert normalize_date("۱۴۰۵/۰۴/۱۹") == "1405-04-19"


def test_normalize_date_accepts_slash_and_zero_pads():
    assert normalize_date("1405/4/9") == "1405-04-09"


def test_normalize_date_rejects_bad_month():
    with pytest.raises(ValueError):
        normalize_date("1405-13-01")


def test_normalize_date_rejects_calendar_invalid_day():
    # Mehr (month 7) has 30 days in the Jalali calendar, so day 31 is impossible.
    with pytest.raises(ValueError):
        normalize_date("1405-07-31")


def test_normalize_date_rejects_non_date():
    with pytest.raises(ValueError):
        normalize_date("hello")
    with pytest.raises(ValueError):
        normalize_date("06/07/1405")  # day-first is rejected (day 1405 invalid)


def test_single_department(data_root):
    assert voice_basename(["cooking"], "1405-04-19", data_root) == "cooking-1405-04-19"


def test_multi_department_sorted_and_deduped(data_root):
    # order-independent + unique => deterministic
    assert voice_basename(["dining", "cooking", "cooking"], "1405-04-19",
                          data_root) == "cooking_dining-1405-04-19"


def test_same_day_collision_gets_02_then_03(data_root):
    audio = data_root / "meetings" / "audio"
    (audio / "cooking-1405-04-19.ogg").write_bytes(b"x")
    assert voice_basename(["cooking"], "1405-04-19", data_root) == "cooking-1405-04-19-02"
    (audio / "cooking-1405-04-19-02.ogg").write_bytes(b"x")
    assert voice_basename(["cooking"], "1405-04-19", data_root) == "cooking-1405-04-19-03"
