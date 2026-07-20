import logging

from telegram import BotCommand, Update
from telegram.error import TimedOut
from telegram.ext import (
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

from upload_bot.handlers import (
    CHOOSE_KIND,
    F_COLLECT,
    F_DEPT,
    V_DATE,
    V_DEPTS,
    V_FILE,
    build_handlers,
)

logger = logging.getLogger(__name__)


async def _set_commands(app):
    # Show /start in the bot's ☰ menu.
    await app.bot.set_my_commands([BotCommand("start", "شروع")])


async def _on_error(update: object, ctx: ContextTypes.DEFAULT_TYPE):
    # Without this, a handler exception is only logged ("No error handlers are
    # registered") and the user is left in silence — they can't tell the upload
    # failed. Log the traceback AND tell the user something went wrong.
    logger.error("Unhandled exception while handling an update", exc_info=ctx.error)
    chat = update.effective_chat if isinstance(update, Update) else None
    if chat is None:
        return
    err = ctx.error
    if isinstance(err, TimedOut):
        text = ("⏳ ارسال فایل بیش از حد طول کشید و ناتمام ماند. "
                "لطفاً دوباره تلاش کنید؛ اگر فایل خیلی حجیم است کمی صبر کنید و مجدداً بفرستید.")
    else:
        detail = f"{type(err).__name__}: {err}" if err else "نامشخص"
        text = ("⚠️ هنگام پردازش خطایی رخ داد و عملیات ناتمام ماند:\n"
                f"{detail}\n\nلطفاً دوباره تلاش کنید.")
    try:
        # Plain text (no parse_mode): the error detail is untrusted and could
        # contain Markdown that would itself fail to send.
        await ctx.bot.send_message(chat.id, text)
    except Exception:
        logger.exception("Failed to deliver error notification to the user")


def build_application(config):
    builder = ApplicationBuilder().token(config.bot_token).post_init(_set_commands)
    # Large voices in --local mode: getFile makes the Bot API server download the
    # file (up to 2 GB) and only then responds, so the bot can wait a long time for
    # the response. PTB's default 5 s read timeout is far too short — a ~124 MB voice
    # timed out mid-download and never got staged. Give getFile/downloads room.
    builder = (
        builder.connect_timeout(30)
        .read_timeout(600)
        .write_timeout(600)
        .media_write_timeout(600)
    )
    if config.proxy_url:
        # Reach Telegram through a proxy (e.g. a local SOCKS proxy). Passing it
        # explicitly makes httpx ignore ambiguous env proxies (ALL_PROXY etc.).
        builder = builder.proxy(config.proxy_url).get_updates_proxy(config.proxy_url)
    if config.api_base_url:
        base = config.api_base_url.rstrip("/")
        # local_mode(True): a --local Bot API server returns an absolute local
        # file path from getFile (not an HTTP URL), so PTB must read the file
        # from disk. That path lives in the Bot API server's data dir, which must
        # be mounted into this container (see deploy/docker-compose.yml).
        builder = (
            builder.base_url(f"{base}/bot")
            .base_file_url(f"{base}/file/bot")
            .local_mode(True)
        )
    app = builder.build()
    h = build_handlers(config)
    conv = ConversationHandler(
        entry_points=[CommandHandler("start", h["start"])],
        allow_reentry=True,
        states={
            CHOOSE_KIND: [CallbackQueryHandler(h["choose_kind"], pattern=r"^k:")],
            V_DATE: [MessageHandler(filters.TEXT & ~filters.COMMAND, h["v_date"])],
            V_DEPTS: [CallbackQueryHandler(h["v_depts"], pattern=r"^vd:")],
            V_FILE: [MessageHandler(filters.VOICE | filters.AUDIO, h["v_file"])],
            F_DEPT: [CallbackQueryHandler(h["f_dept"], pattern=r"^fd:")],
            F_COLLECT: [MessageHandler(filters.Document.ALL, h["f_collect"]),
                        CommandHandler("done", h["f_done"])],
        },
        fallbacks=[CommandHandler("cancel", h["cancel"])],
    )
    app.add_handler(conv)
    app.add_error_handler(_on_error)
    return app
