from upload_bot.registry import (
    department_choices,
    department_codes,
    is_valid_department,
)


def test_lists_all_nine_departments(data_root):
    codes = department_codes(data_root)
    assert set(codes) == {"management", "accounting", "warehouse", "procurement",
                          "cooking", "preparation", "dining", "cashier", "logistics"}


def test_valid_and_invalid(data_root):
    assert is_valid_department("cooking", data_root) is True
    assert is_valid_department("nope", data_root) is False


def test_choices_pair_code_with_persian_name(data_root):
    choices = department_choices(data_root)
    assert len(choices) == 9
    assert ("cooking", "پخت") in choices
    assert ("dining", "سالن") in choices
