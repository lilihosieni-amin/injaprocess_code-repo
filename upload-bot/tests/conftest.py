import asyncio
import pathlib

import pytest
from upload_bot import transcription


@pytest.fixture
def data_root(tmp_path):
    root = tmp_path / "data"
    for sub in ("departments/cooking/attachments", "departments/dining/attachments",
                "meetings/audio", ".staging"):
        (root / sub).mkdir(parents=True)
    registry = pathlib.Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "registry.json"
    (root / "departments").mkdir(exist_ok=True)
    (root / "departments" / "registry.json").write_text(
        registry.read_text(encoding="utf-8"), encoding="utf-8")
    return root


@pytest.fixture(autouse=True)
def fresh_transcription_lock(monkeypatch):
    """An asyncio.Lock binds to the loop that first contends on it, and every test runs its
    own asyncio.run() loop — so hand each one a fresh lock instead of a cross-loop RuntimeError.
    """
    monkeypatch.setattr(transcription, "_LOCK", asyncio.Lock())
