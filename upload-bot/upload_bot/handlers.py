from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes, ConversationHandler

from upload_bot.attachments import attachment_dest
from upload_bot.auth import is_allowed
from upload_bot.naming import normalize_date, voice_basename
from upload_bot.registry import department_codes, is_valid_department
from upload_bot.session import FileBatch, VoiceUpload
from upload_bot.staging import discard, finalize, stage

CHOOSE_KIND, V_DATE, V_DEPTS, V_FILE, F_DEPT, F_COLLECT = range(6)


def _guard(config):
    def ok(update):
        u = update.effective_user
        return u is not None and is_allowed(u.id, config.allowed_user_id)
    return ok


def build_handlers(config):
    guard = _guard(config)
    root = config.data_root

    async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
        if not guard(update):
            return ConversationHandler.END
        kb = InlineKeyboardMarkup([[InlineKeyboardButton("صوت", callback_data="k:voice"),
                                    InlineKeyboardButton("فایل", callback_data="k:file")]])
        await update.message.reply_text("نوع بارگذاری را انتخاب کنید:", reply_markup=kb)
        return CHOOSE_KIND

    async def choose_kind(update: Update, ctx):
        if not guard(update):
            return ConversationHandler.END
        q = update.callback_query
        await q.answer()
        if q.data == "k:voice":
            ctx.user_data["voice"] = VoiceUpload()
            await q.edit_message_text("تاریخ جلسه را وارد کنید (مثلاً 2026-07-06):")
            return V_DATE
        if q.data == "k:file":
            ctx.user_data["batch"] = FileBatch()
            await q.edit_message_text("دپارتمان این دسته را انتخاب کنید:",
                                      reply_markup=_dept_kb(root, "fd"))
            return F_DEPT
        return CHOOSE_KIND

    async def v_date(update: Update, ctx):
        if not guard(update):
            return ConversationHandler.END
        try:
            ctx.user_data["voice"].date = normalize_date(update.message.text)
        except ValueError as e:
            await update.message.reply_text(str(e))
            return V_DATE
        await update.message.reply_text("دپارتمان‌های مرتبط را انتخاب کنید:",
                                        reply_markup=_dept_kb(root, "vd", multi=True))
        return V_DEPTS

    async def v_depts(update: Update, ctx):
        if not guard(update):
            return ConversationHandler.END
        q = update.callback_query
        await q.answer()
        v = ctx.user_data["voice"]
        if q.data == "vd:done":
            if not v.ready():
                await q.answer("حداقل یک دپارتمان لازم است", show_alert=True)
                return V_DEPTS
            await q.edit_message_text("اکنون فایل صوتی را ارسال کنید.")
            return V_FILE
        v.toggle_department(q.data.split(":", 1)[1])
        await q.edit_message_reply_markup(_dept_kb(root, "vd", multi=True, chosen=v.departments))
        return V_DEPTS

    async def v_file(update: Update, ctx):
        if not guard(update):
            return ConversationHandler.END
        v = ctx.user_data["voice"]
        tg = update.message.voice or update.message.audio
        data = bytes(await (await tg.get_file()).download_as_bytearray())
        staged = stage(root, data, hint="voice")
        base = voice_basename(v.departments, v.date, root)
        ext = "ogg" if update.message.voice else "mp3"
        try:
            finalize(staged, root / "meetings" / "audio" / f"{base}.{ext}")
        except Exception:
            discard([staged])
            raise
        await update.message.reply_text(
            f"ذخیره شد. شناسه برای شروع پردازش:\n`{base}`", parse_mode="Markdown")
        return ConversationHandler.END

    async def f_dept(update: Update, ctx):
        if not guard(update):
            return ConversationHandler.END
        q = update.callback_query
        await q.answer()
        code = q.data.split(":", 1)[1]
        if not is_valid_department(code, root):
            return F_DEPT
        ctx.user_data["batch"].department = code
        await q.edit_message_text("فایل‌ها را بفرستید؛ در پایان /done را بزنید.")
        return F_COLLECT

    async def f_collect(update: Update, ctx):
        if not guard(update):
            return ConversationHandler.END
        doc = update.message.document
        b = ctx.user_data["batch"]
        data = bytes(await (await doc.get_file()).download_as_bytearray())
        b.add_file(doc.file_name or "file", stage(root, data, hint="file"))
        await update.message.reply_text(f"دریافت شد ({len(b.files)}). ادامه دهید یا /done.")
        return F_COLLECT

    async def f_done(update: Update, ctx):
        if not guard(update):
            return ConversationHandler.END
        b = ctx.user_data["batch"]
        if not b.ready():
            await update.message.reply_text("هیچ فایلی دریافت نشد.")
            return F_COLLECT
        for original, staged in b.files:
            finalize(staged, attachment_dest(b.department, original, root))
        await update.message.reply_text(
            f"{len(b.files)} فایل در دپارتمان {b.department} ذخیره شد.")
        return ConversationHandler.END

    async def cancel(update: Update, ctx):
        if not guard(update):
            return ConversationHandler.END
        for key in ("voice", "batch"):
            obj = ctx.user_data.pop(key, None)
            if isinstance(obj, FileBatch):
                discard([s for _, s in obj.files])
        await update.effective_message.reply_text("لغو شد.")
        return ConversationHandler.END

    return {"start": start, "choose_kind": choose_kind, "v_date": v_date,
            "v_depts": v_depts, "v_file": v_file, "f_dept": f_dept,
            "f_collect": f_collect, "f_done": f_done, "cancel": cancel}


def _dept_kb(data_root, prefix, multi=False, chosen=()):
    rows = []
    for code in department_codes(data_root):
        mark = "✅ " if code in chosen else ""
        rows.append([InlineKeyboardButton(f"{mark}{code}", callback_data=f"{prefix}:{code}")])
    if multi:
        rows.append([InlineKeyboardButton("تمام شد", callback_data=f"{prefix}:done")])
    return InlineKeyboardMarkup(rows)
