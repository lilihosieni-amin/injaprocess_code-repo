import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from upload_bot import handlers
from upload_bot.config import Config
from upload_bot.session import FileBatch


def _update(document=None, photo=None):
    async def get_file():
        return SimpleNamespace(
            download_as_bytearray=AsyncMock(return_value=bytearray(b"bytes")))

    for tg in (document, *(photo or ())):
        if tg is not None:
            tg.get_file = get_file
    message = SimpleNamespace(document=document, photo=photo, reply_text=AsyncMock())
    return SimpleNamespace(message=message, effective_user=SimpleNamespace(id=7))


def _collect(data_root, update):
    cfg = Config(bot_token="1:a", allowed_user_ids=frozenset({7}), data_root=data_root)
    ctx = SimpleNamespace(user_data={"batch": FileBatch(department="cooking")})
    asyncio.run(handlers.build_handlers(cfg)["f_collect"](update, ctx))
    return ctx.user_data["batch"]


def test_f_collect_accepts_a_document(data_root):
    update = _update(document=SimpleNamespace(file_name="menu.pdf"))
    assert _collect(data_root, update).files[0][0] == "menu.pdf"


def test_f_collect_accepts_a_photo(data_root):
    # Telegram sends a photo as a list of sizes with no file_name; the largest is last.
    update = _update(photo=[SimpleNamespace(file_unique_id="small"),
                            SimpleNamespace(file_unique_id="big")])
    batch = _collect(data_root, update)
    assert batch.files[0][0] == "photo-big.jpg"
    assert batch.ready()
