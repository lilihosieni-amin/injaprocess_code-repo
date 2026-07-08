from telegram import BotCommand
from telegram.ext import (
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
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


async def _set_commands(app):
    # Show /start in the bot's ☰ menu.
    await app.bot.set_my_commands([BotCommand("start", "شروع")])


def build_application(config):
    builder = ApplicationBuilder().token(config.bot_token).post_init(_set_commands)
    if config.proxy_url:
        # Reach Telegram through a proxy (e.g. a local SOCKS proxy). Passing it
        # explicitly makes httpx ignore ambiguous env proxies (ALL_PROXY etc.).
        builder = builder.proxy(config.proxy_url).get_updates_proxy(config.proxy_url)
    if config.api_base_url:
        base = config.api_base_url.rstrip("/")
        builder = builder.base_url(f"{base}/bot").base_file_url(f"{base}/file/bot")
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
    return app
