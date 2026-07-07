from conftest import FIXTURE_DIR, SCHEMA_DIR


def test_dirs_exist():
    assert SCHEMA_DIR.is_dir()
    assert FIXTURE_DIR.is_dir()
