from upload_bot.registry import department_codes, is_valid_department


def test_lists_all_nine_departments(data_root):
    codes = department_codes(data_root)
    assert set(codes) == {"management", "accounting", "warehouse", "procurement",
                          "cooking", "preparation", "dining", "cashier", "logistics"}


def test_valid_and_invalid(data_root):
    assert is_valid_department("cooking", data_root) is True
    assert is_valid_department("nope", data_root) is False
