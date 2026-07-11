from inja_ui_backend.config import load_settings

REPO_SCHEMAS = None  # resolved lazily


def cfg_for(data_root):
    import pathlib

    schemas = pathlib.Path(__file__).resolve().parents[2] / "schemas"
    return load_settings({
        "DATA_ROOT": str(data_root),
        "SCHEMA_DIR": str(schemas),
        "UI_USERNAME": "analyst",
        "UI_PASSWORD_HASH": "$argon2id$dummy",
        "SESSION_SIGNING_KEY": "k",
    })
