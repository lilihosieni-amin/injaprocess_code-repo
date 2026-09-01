#!/usr/bin/env python3
"""Mock quantitative-facts data for UI work.

Writes, next to this file:

  store/items.json, records.json, measurements.json, rules.json, notes.json
      — the five fact files exactly as merge would write them (spec §4, §6, §7)
  store/.index.json, store/manifest.json
  api/entries.json      — id → {entry, confirmation, consumers, orphans}: the
                          detail view the ui-backend will serve
  api/list.json         — the list screen: one summary row per entry
  api/worklist.json     — the gap worklist, blockers first
  api/branches.json, api/coverage.json, api/processes.json, api/confirmations.json
  README.md             — which entry shows which state

Spec: docs/superpowers/specs/2026-08-29-quantitative-facts-design.md.
Re-run after editing: python3 ui/design/mock/facts/generate_mock.py
"""
from __future__ import annotations

import hashlib
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
STORE = HERE / "store"
API = HERE / "api"

RUN_MGMT = "runs/facts/management/20260901-101500"
RUN_COOK = "runs/facts/cooking/20260902-153000"
RUN_COOK2 = "runs/facts/cooking/20260915-110000"
RUN_PREP = "runs/facts/preparation/20260903-090000"
RUN_CHAT = "runs/facts/cooking/20260916-140000"
NOW = "2026-09-16T14:05:00Z"

GOZARESH_CB = "attachments/sheets/MandeShab__ChaleBagh__Gozaresh markazi/Gozaresh markazi.xlsx"
GOZARESH_NK = "attachments/sheets/MandeShab__Naharkhoran__Gozaresh naharkhoran/Gozaresh naharkhoran.xlsx"
PITZA_CB = "attachments/sheets/MandeShab__ChaleBagh__Amar__Pitza/Pitza.xlsx"
MAVAD = "attachments/sheets/MandeShab__Mavade Avalie/Mavade Avalie.xlsx"
ANBAR = "attachments/sheets/Anbar__Anbar/Anbar.xlsx"
HESABDARI = "attachments/sheets/Hesabdari__Hesabdari/Hesabdari.xlsx"
SALON_CB = "attachments/sheets/Salon__Salon - Chalebagh/Salon - Chalebagh.xlsx"
GS_CB = "attachments/sheets/MandeShab__ChaleBagh__Gozaresh markazi/Gozaresh markazi.gs"
GS_DASH = "attachments/sheets/Gozareshat/Gozareshat.gs"
GS_SALES = "attachments/sheets/MandeShab__ChaleBagh__Amar__Tedade Fooroosh markazi/Tedade Fooroosh markazi.gs"
T0526 = "meetings/transcripts/cooking-1405-05-26.txt"
T0601 = "meetings/transcripts/cooking-1405-06-01.txt"
T0522 = "meetings/transcripts/cooking-1405-05-22.txt"
TPREP = "meetings/transcripts/preparation-1405-06-02-02.txt"
PHOTO1 = "departments/cooking/attachments/photo_2026-08-29_14-23-51.jpg"
PHOTO2 = "departments/cooking/attachments/photo_2026-08-29_14-23-56.jpg"
PDF_KITCHEN = "departments/cooking/attachments/kitchen-quantitative-report.pdf"
DOCX_ACC = "departments/accounting/attachments/sales-targets-memo.docx"
PROC_COOK1 = "departments/cooking/processes/cooking-001.json"
PROC_COOK2 = "departments/cooking/processes/cooking-002.json"
PROC_ACC3 = "departments/accounting/processes/accounting-003.json"


def h(s: str) -> str:
    return "sha256:" + hashlib.sha256(s.encode("utf-8")).hexdigest()


def src(type_, ref, run, **loc):
    d = {"type": type_, "ref": ref}
    d.update(loc)
    d["hash"] = None if type_ == "chat" else h(ref)
    d["run"] = run
    return d


def ref(id_, field=None, row=None):
    d = {"ref": id_}
    if field is not None:
        d["field"] = field
    if row is not None:
        d["row"] = row
    return d


def account(field, statement, value, source, speaker_role=None, status="open", unit=None):
    raw = "|".join([field, statement, json.dumps(value, ensure_ascii=False), source.get("ref") or "",
                    str(source.get("cell") or source.get("lines") or "")])
    d = {"id": hashlib.sha256(raw.encode()).hexdigest()[:8], "field": field, "statement": statement}
    if value is not None:
        d["value"] = value
    if unit is not None:
        d["unit"] = unit
    d["source"] = {k: v for k, v in source.items() if k not in ("hash", "run")}
    d["speaker_role"] = speaker_role
    d["status"] = status
    return d


def scope(departments=(), branches=()):
    return {"departments": list(departments), "branches": list(branches)}


def entry(id_, kind, key, title, statement, scope_, source, data, *, aliases=(), field_status=None,
          accounts=(), valid_from=None, valid_to=None, supersedes=None, superseded_by=None,
          retired=False, issues=(), processes=(), updated_at=NOW):
    return {
        "id": id_, "kind": kind, "key": key, "title": title, "aliases": list(aliases),
        "statement": statement, "scope": scope_, "source": list(source),
        "status": None,  # derived below
        "field_status": dict(field_status or {}),
        "accounts": list(accounts),
        "valid_from": valid_from, "valid_to": valid_to,
        "supersedes": supersedes, "superseded_by": superseded_by,
        "retired": retired, "issues": list(issues), "processes": list(processes),
        "updated_at": updated_at, "data": data,
    }


# ---------------------------------------------------------------------------
# Derivations (what merge does — spec QF-6, QF-24, QF-31)
# ---------------------------------------------------------------------------

def null_leaves(obj, path="data"):
    out = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            p = f"{path}/{obj['key']}" if False else f"{path}/{k}"
            if v is None:
                out.append(p)
            else:
                out.extend(null_leaves(v, p))
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, dict) and "key" in item:
                out.extend(null_leaves({k: v for k, v in item.items() if k != "key"}, f"{path}/{item['key']}"))
            else:
                out.extend(null_leaves(item, path))
    return out


def derive_status(e):
    if any(a["status"] == "open" for a in e["accounts"]):
        return "disputed"
    if null_leaves(e["data"]):
        return "unknown"
    vals = set(e["field_status"].values())
    if "informal" in vals:
        return "informal"
    if "inferred" in vals:
        return "inferred"
    return "confirmed"


def canonical(e):
    body = {k: v for k, v in e.items() if k != "updated_at"}
    return json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def fingerprint(e):
    return "sha256:" + hashlib.sha256(canonical(e).encode()).hexdigest()


# ---------------------------------------------------------------------------
# The entries
# ---------------------------------------------------------------------------

E = []

# ---- items ----------------------------------------------------------------
E.append(entry("F-00001", "item", "ing_1", "پنیر پیتزا", "پنیر موزارلای پیتزا؛ به گرم وزن می‌شود، کارتن ۱۰ کیلویی.",
    scope(), [src("sheet", MAVAD, RUN_MGMT, sheet="پیتزا ایتالیایی", cell="B1"),
              src("voice", T0526, RUN_COOK, lines="92")],
    {"code": "##1", "code_absent": False, "category": "ingredient", "group": "cheese", "state": "raw",
     "unit": "g", "unit_raw": "گرم", "units": [{"pack_unit": "carton", "factor_to_base": 10000}],
     "pack": {"size": 10, "unit": "kg"}, "tracked": []},
    aliases=["موزارلا", "پنیر"], processes=[ref("cooking-001")]))

E.append(entry("F-00002", "item", "prod_61", "اینجا پیتزا", "محصول کد #61؛ پیتزای ایتالیایی اختصاصی.",
    scope(), [src("sheet", MAVAD, RUN_MGMT, sheet="پیتزا ایتالیایی", cell="A2")],
    {"code": "#61", "code_absent": False, "category": "product", "group": "italian_pizza", "unit": "pcs",
     "unit_raw": "عدد", "units": [], "tracked": []}))

E.append(entry("F-00003", "item", "ing_15", "بیکن ورقه‌ای", "بیکن از انبار به تعداد (۳۰ یا ۱۵ عدد) دریافت و در مانده شب به وزن ثبت می‌شود؛ هر ۳۰ ورق بین ۹۰۰ تا ۹۸۰ گرم.",
    scope(["cooking"]), [src("voice", T0526, RUN_COOK, lines="188-200"), src("sheet", PITZA_CB, RUN_COOK, sheet="موجودی اول شب", cell="O1")],
    {"code": "##15", "code_absent": False, "category": "ingredient", "group": "cold_cuts", "state": "raw",
     "unit": "g", "unit_raw": "گرم", "units": [{"pack_unit": "pcs", "factor_to_base": {"min": 30.0, "max": 32.7}}],
     "pack": {"size": 30, "unit": "pcs"}, "tracked": []},
    aliases=["بیکن"], issues=[{"kind": "unit_kind", "field": "data/unit", "from_date": "1404-11-14",
                              "description": "در فرنگی از ۱۴ بهمن ۱۴۰۴ به‌جای گرم، تعداد ورق ثبت شده است (۱۱۶۵ → ۷۱).",
                              "fix": {"op": "ignore"}, "affects": [ref("F-00013")]}]))

E.append(entry("F-00004", "item", "gouda_cup", "گودا لیوانی", "پنیر گودای لیوانی که در فرم مانده شب فرنگی ردیف دارد؛ کد انبار برای آن یافت نشد.",
    scope(["cooking"]), [src("photo", PHOTO1, RUN_COOK)],
    {"code": None, "code_absent": True, "category": "ingredient", "group": "cheese", "unit": "pcs", "unit_raw": "عدد",
     "units": [], "tracked": []}))
# NB: code None is a null leaf → this item is `unknown` until a code is found or code_absent stays and code is omitted.
E[-1]["data"].pop("code")  # keep code_absent: true, no null → confirmed

E.append(entry("F-00005", "item", "meat_27", "میت", "پیتزای میت، کد #27 — همان کد برای «سیب زمینی ویژه» هم به کار رفته است.",
    scope(), [src("script", GS_SALES, RUN_MGMT, function="foodIdToCategory")],
    {"code": "#27", "code_absent": False, "category": "product", "group": "american_pizza", "unit": "pcs", "units": [], "tracked": []},
    issues=[{"kind": "code_collision", "field": "data/code", "description": "کد #27 در «تعداد فروش» دو بار تعریف شده (americanPizza و starter)؛ فروش میت در واردکننده گم می‌شود.",
             "affects": [ref("F-00006")]}],
    updated_at="2026-09-15T11:02:00Z"))

E.append(entry("F-00006", "item", "potato_special_27", "سیب زمینی ویژه", "استارتر با کد #27 — کد مشترک با «میت».",
    scope(), [src("script", GS_SALES, RUN_MGMT, function="foodIdToCategory")],
    {"code": "#27", "code_absent": False, "category": "product", "group": "starter", "unit": "pcs", "units": [], "tracked": []},
    issues=[{"kind": "code_collision", "field": "data/code", "description": "کد #27 مشترک با «میت».", "affects": [ref("F-00005")]}]))

E.append(entry("F-00007", "item", "ing_41", "قارچ", "قارچ تازه؛ روزانه حدود ۲۰ کیلو به سوخاری تحویل می‌شود و در مانده شب ثبت نمی‌شود.",
    scope(["cooking"]), [src("voice", T0526, RUN_COOK, lines="262")],
    {"code": "##41", "code_absent": False, "category": "ingredient", "group": "vegetables", "state": "raw", "unit": "kg", "unit_raw": "کیلو",
     "units": [], "tracked": [{"record": ref("F-00013"), "value": False, "reason": "قارچ درشت/ریز/پشت‌باز به آماده‌سازی برمی‌گردد و اسلایس می‌شود؛ مانده‌ی ساده تصویر واقعی نمی‌دهد."}]}))

E.append(entry("F-00008", "item", "place_warehouse", "انبار", "انبار مرکزی؛ مبدأ و مقصد انتقال‌ها.", scope(),
    [src("sheet", ANBAR, RUN_MGMT, sheet="خروجی انبار به آماده سازی", cell="A1")],
    {"category": "place", "unit": "pcs", "units": [], "tracked": []}))

E.append(entry("F-00009", "item", "place_prep", "آماده‌سازی", "واحد آماده‌سازی؛ تبدیل مواد در آن انجام می‌شود.", scope(),
    [src("sheet", ANBAR, RUN_MGMT, sheet="خروجی انبار به آماده سازی", cell="A1")],
    {"category": "place", "unit": "pcs", "units": [], "tracked": []}))

E.append(entry("F-00010", "item", "ing_22", "گوشت چرخ‌کرده", "دیگر استفاده نمی‌شود («کباب ترکی حذف شده»).",
    scope(["cooking"]), [src("voice", T0526, RUN_COOK, lines="107")],
    {"code": "##22", "code_absent": False, "category": "ingredient", "group": "meat", "state": "raw", "unit": "g", "units": [], "tracked": []},
    retired=True, valid_to="1405-05-26", updated_at="2026-09-02T15:40:00Z"))

# ---- records ------------------------------------------------------------------
E.append(entry("F-00011", "record", "mande_shab_farangi_burger", "مانده شب فرنگی و برگر",
    "فرم کاغذی مانده شب بخش فرنگی؛ ده ردیف ثابت، هر شیفت یک برگ. واحد ستون‌ها روی فرم چاپ نشده است.",
    scope(["cooking"], ["chalebagh"]), [src("photo", PHOTO1, RUN_COOK), src("voice", T0526, RUN_COOK, lines="74-80")],
    {"medium": "paper", "role": "log", "location": {"path": PHOTO1}, "blank_master": True,
     "grain": "هر ردیف یک قلم، هر برگ یک شیفت", "cadence": "nightly", "day_boundary": "01:15",
     "header_fields": [{"key": "date", "title": "تاریخ"}, {"key": "operator", "title": "نام متصدی"}],
     "fields": [
         {"key": "row_no", "title": "ردیف", "type": "integer"},
         {"key": "item", "title": "نام کالا", "type": "string", "refItems": {"namespace": "##", "resolved_by": "title"}},
         {"key": "start_stock", "title": "مانده اول شب", "type": "number", "unit": None, "filled_by": "مسئول واحد"},
         {"key": "received", "title": "درخواست دریافتی", "type": "number", "unit": None, "constraints": {"readOnly": True},
          "description": "خانه‌ی سایه‌دار — «چیزی ننویسید»"},
         {"key": "end_stock", "title": "مانده آخر شب", "type": "number", "unit": None},
         {"key": "delta", "title": "اختلاف روز", "type": "number", "unit": None, "derived": ref("F-00030")}],
     "rows": [{"key": "burger", "title": "برگر"}, {"key": "mini_burger", "title": "مینی برگر"}, {"key": "roast_beef", "title": "رست بیف"},
              {"key": "grilled_chicken", "title": "مرغ گریل"}, {"key": "hot_dog", "title": "هات داگ"},
              {"key": "double_ham", "title": "ژامبون دوگانه"}, {"key": "bacon", "title": "بیکن ورقه ای"},
              {"key": "parmesan", "title": "پارمسان"}, {"key": "gouda_slice", "title": "گودا ورقه ای"}, {"key": "gouda_cup", "title": "گودا لیوانی"}],
     "signatures": [{"role": "مسئول واحد", "row_range": "1-5"}, {"role": "انبار دار", "row_range": "6-10"}],
     "primaryKey": ["date", "item"], "foreignKeys": [], "approved_by": "انبار دار"}))

E.append(entry("F-00012", "record", "goods_request_counter", "درخواست کالا بخش کانتر آشپزخانه",
    "فرم کاغذی درخواست کالا با سه بخش سند (مصرف مستقیم، حواله انبار به انبار، بدون سند)، حدود ۷۳ ردیف ثابت و یک ردیف باز.",
    scope(["cooking"]), [src("photo", PHOTO2, RUN_COOK), src("pdf", PDF_KITCHEN, RUN_COOK2, page="9")],
    {"medium": "paper", "role": "log", "location": {"path": PHOTO2}, "blank_master": True,
     "grain": "هر ردیف یک قلم، هر برگ یک درخواست", "cadence": "daily",
     "header_fields": [{"key": "date", "title": "تاریخ"}, {"key": "weekday", "title": "روزهفته"}, {"key": "doc_no", "title": "ش س"}],
     "fields": [{"key": "item", "title": "شرح کالا", "type": "string", "refItems": {"namespace": "##", "resolved_by": "title"}},
                {"key": "unit", "title": "واحد", "type": "string"},
                {"key": "requested", "title": "مقدار درخواست", "type": "number", "filled_by": "مسئول کانتر"},
                {"key": "delivered", "title": "مقدار تحویل", "type": "number", "filled_by": "انبار دار"},
                {"key": "warehouse_tick", "title": "تیک انبار", "type": "boolean"}],
     "sections": [{"key": "direct_use", "title": "مصرف مستقیم", "doc_number_field": "doc_no"},
                  {"key": "store_to_store", "title": "ح انبار به انبار", "doc_number_field": "doc_no"},
                  {"key": "undocumented", "title": "بدون سند", "doc_number_field": "doc_no"}],
     "rows": [{"key": "burger_box", "title": "جعبه برگر", "unit": "carton", "unit_raw": "کارتن ۱۰۰تایی", "section": "direct_use"},
              {"key": "cup_lid", "title": "لیوان نوشابه + درب", "unit": "pack", "unit_raw": "بسته ۱۰۰تایی", "section": "direct_use"},
              {"key": "staff_sugar", "title": "قند پرسنلی (پنجشنبه‌ها)", "unit": "pack", "section": "direct_use", "when": "thursday"},
              {"key": "off_list", "title": "درخواست خارج از لیست", "section": "undocumented", "open": True}],
     "signatures": [{"role": "مسئول کانتر", "row_range": "1-73"}],
     "primaryKey": ["date", "doc_no", "item"], "foreignKeys": []}))

E.append(entry("F-00013", "record", "pitza_cb__end_of_night", "موجودی آخر شب — پیتزا (چاله‌باغ)",
    "برگهٔ شب ایستگاه پیتزا: هر شب یک ردیف، هر ستون یک قلم به گرم؛ تاریخ در سه ستون روز/ماه/سال.",
    scope(["cooking"], ["chalebagh"]), [src("sheet", PITZA_CB, RUN_COOK, sheet="موجودی آخر شب", cell="A1"),
                                        src("validation", PITZA_CB, RUN_COOK, sheet="موجودی آخر شب", cell="D2:D400")],
    {"medium": "sheet", "role": "log", "location": {"spreadsheetId": "1dmH8tCqOuqNr2nt4AwJrHC2cq-rv0tIBHc4kk05bWtU", "sheetId": 2, "sheet": "موجودی آخر شب", "hidden": False},
     "grain": "هر ردیف یک شب", "cadence": "nightly", "day_boundary": "01:15",
     "fields": [{"key": "day", "title": "روز", "type": "integer", "constraints": {"minimum": 1, "maximum": 31}},
                {"key": "month", "title": "ماه", "type": "string", "constraints": {"enum": ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]}},
                {"key": "year", "title": "سال", "type": "integer"},
                {"key": "end_stock", "title": "وزن پنیر پیتزا ##1", "type": "number", "unit": "g", "unit_raw": "گرم", "refItems": {"namespace": "##", "resolved_by": "code"}, "filled_by": "سرلاین"},
                {"key": "bacon_end", "title": "وزن بیکن ##15", "type": "number", "unit": "g", "unit_raw": "گرم"}],
     "rows": [], "primaryKey": ["day", "month", "year"], "foreignKeys": []},
    issues=[{"kind": "scale", "field": "data/fields/end_stock", "from_date": "1404-09-16",
             "description": "از ۱۶ آذر ۱۴۰۴ مقادیر به گرم ثبت شده‌اند نه کیلوگرم (۳۹٫۱۵۸ → ۳۵۰۰۰).",
             "fix": {"op": "multiply", "factor": 1000}, "affects": [ref("F-00016")]}],
    processes=[ref("cooking-001")]))

E.append(entry("F-00014", "record", "mavad__pizza_italian", "مواد اولیه — پیتزا ایتالیایی (BOM)",
    "جدول مرجع مقدار هر مادهٔ اولیه به گرم برای هر محصول ایتالیایی؛ یک ردیف برای هر (محصول، ماده).",
    scope(), [src("sheet", MAVAD, RUN_MGMT, sheet="پیتزا ایتالیایی", cell="A1:V14"), src("voice", T0526, RUN_COOK, lines="320")],
    {"medium": "sheet", "role": "reference", "location": {"spreadsheetId": "15M2ovUmQ7kX3nR9pLwT2aB8cD4eF6gH1", "sheetId": 2, "sheet": "پیتزا ایتالیایی", "hidden": False},
     "grain": "هر ردیف یک (محصول، ماده)",
     "fields": [{"key": "product", "title": "محصول", "type": "string", "refItems": {"namespace": "#", "resolved_by": "code"}},
                {"key": "ingredient", "title": "ماده اولیه", "type": "string", "refItems": {"namespace": "##", "resolved_by": "code"}},
                {"key": "grams", "title": "گرم", "type": "number", "unit": "g"}],
     "primaryKey": ["product", "ingredient"],
     "rows": [{"key": "prod_61__ing_1", "product": "prod_61", "ingredient": "ing_1", "grams": 250},
              {"key": "prod_61__ing_26", "product": "prod_61", "ingredient": "ing_26", "grams": 280},
              {"key": "prod_61__ing_41", "product": "prod_61", "ingredient": "ing_41", "grams": None},
              {"key": "prod_61__ing_22", "product": "prod_61", "ingredient": "ing_22", "grams": 60, "retired": True, "valid_to": "1405-05-26"}],
     "mirror_of": None, "reconciled_against": [{"cell": {"field": "grams", "row": "prod_61__ing_26"}, "against": ref("F-00046", "dough_g")}]},
    accounts=[account("data/rows/prod_61__ing_1/grams", "پیتزای X = ۸۰۰ گرم پنیر … ۷ × ۸۰۰ = ۵۶۰۰ گرم", 800,
                      src("pdf", PDF_KITCHEN, RUN_COOK2, page="15"), speaker_role="سرپرست گزارش‌ها"),
              account("data/rows/prod_61__ing_1/grams", "250 (Mavade Avalie!پیتزا ایتالیایی!B2)", 250,
                      src("sheet", MAVAD, RUN_MGMT, sheet="پیتزا ایتالیایی", cell="B2"))]))
E[-1]["data"].pop("mirror_of")  # not applicable → omitted, not null

E.append(entry("F-00015", "record", "gozaresh_cb__table_pizza_first", "Table_Pizza_First (نسخهٔ پیوندی)",
    "برگهٔ مخفی که با IMPORT_FROM_SHEET از «موجودی اول شب» ایستگاه پیتزا پر می‌شود؛ داده‌ای از خودش ندارد.",
    scope(["management"], ["chalebagh"]), [src("sheet", GOZARESH_CB, RUN_MGMT, sheet="Table_Pizza_First", cell="A1")],
    {"medium": "sheet", "role": "mirror", "location": {"spreadsheetId": "1shXFbKyvEkpA_R6Bf4vSU1Nx_1vAhRxj8lfFYSvtG5s", "sheetId": 39, "sheet": "Table_Pizza_First", "hidden": True},
     "mirror_of": ref("F-00013"), "rows": []}))

E.append(entry("F-00016", "record", "gozaresh_cb__pizza", "گزارش مرکزی — پیتزا (چاله‌باغ)",
    "برگهٔ گزارش پیتزا در گزارش مرکزی: به ازای هر قلم، مانده اول شب، دریافت، مانده آخر شب، مصرف اعلامی، مصرف واقعی، انحراف و تلورانس.",
    scope(["management"], ["chalebagh"]), [src("sheet", GOZARESH_CB, RUN_MGMT, sheet="پیتزا", cell="E5:M5"),
                                           src("cf", GOZARESH_CB, RUN_MGMT, sheet="پیتزا", cell="J6:J15")],
    {"medium": "sheet", "role": "report", "location": {"spreadsheetId": "1shXFbKyvEkpA_R6Bf4vSU1Nx_1vAhRxj8lfFYSvtG5s", "sheetId": 4, "sheet": "پیتزا", "hidden": False},
     "grain": "هر ردیف یک قلم برای تاریخ انتخاب‌شده", "cadence": "daily",
     "header_fields": [{"key": "day", "title": "روز"}, {"key": "month", "title": "ماه"}, {"key": "year", "title": "سال"}],
     "fields": [{"key": "item", "title": "قلم", "type": "string", "refItems": {"namespace": "##", "resolved_by": "code"}},
                {"key": "start_stock", "title": "موجودی اول شب", "type": "number", "unit": "kg"},
                {"key": "received", "title": "مقدار دریافت از انبار", "type": "number", "unit": "kg"},
                {"key": "end_stock", "title": "موجودی آخر شب", "type": "number", "unit": "kg"},
                {"key": "declared_use", "title": "مصرف اعلامی", "type": "number", "unit": "kg", "derived": ref("F-00030")},
                {"key": "actual_use", "title": "مصرف واقعی", "type": "number", "unit": "kg", "derived": ref("F-00031")},
                {"key": "deviation", "title": "انحراف", "type": "number", "unit": "kg"},
                {"key": "tolerance", "title": "تلورانس", "type": "number", "unit": "g"}],
     "primaryKey": ["day", "month", "year", "item"],
     "foreignKeys": [{"fields": ["day", "month", "year"], "reference": ref("F-00013"), "reference_fields": ["day", "month", "year"], "transform": ref("F-00036")}],
     "rows": []},
    processes=[ref("cooking-001")]))

E.append(entry("F-00017", "record", "units", "واحدها", "جدول واحدهای مجاز: نماد، بُعد، ضریب تبدیل به واحد پایه.",
    scope(), [src("chat", None, RUN_MGMT)],
    {"medium": "native", "role": "config", "location": {}, "grain": "هر ردیف یک واحد",
     "fields": [{"key": "symbol", "title": "نماد", "type": "string"}, {"key": "dimension", "title": "بُعد", "type": "string",
                 "constraints": {"enum": ["mass", "volume", "count", "pack", "duration", "money", "dimensionless"]}},
                {"key": "factor_to_base", "title": "ضریب به واحد پایه", "type": "number"}, {"key": "unit_title", "title": "عنوان", "type": "string"}],
     "primaryKey": ["symbol"],
     "rows": [{"key": "g", "symbol": "g", "dimension": "mass", "factor_to_base": 1, "unit_title": "گرم"},
              {"key": "kg", "symbol": "kg", "dimension": "mass", "factor_to_base": 1000, "unit_title": "کیلوگرم"},
              {"key": "ml", "symbol": "ml", "dimension": "volume", "factor_to_base": 1, "unit_title": "میلی‌لیتر"},
              {"key": "l", "symbol": "l", "dimension": "volume", "factor_to_base": 1000, "unit_title": "لیتر"},
              {"key": "pcs", "symbol": "pcs", "dimension": "count", "factor_to_base": 1, "unit_title": "عدد"},
              {"key": "slice", "symbol": "slice", "dimension": "count", "factor_to_base": 1, "unit_title": "ورق"},
              {"key": "portion", "symbol": "portion", "dimension": "count", "factor_to_base": 1, "unit_title": "پرس"},
              {"key": "carton", "symbol": "carton", "dimension": "pack", "factor_to_base": None, "unit_title": "کارتن"},
              {"key": "pack", "symbol": "pack", "dimension": "pack", "factor_to_base": None, "unit_title": "بسته"},
              {"key": "min", "symbol": "min", "dimension": "duration", "factor_to_base": 1, "unit_title": "دقیقه"},
              {"key": "irr", "symbol": "irr", "dimension": "money", "factor_to_base": 1, "unit_title": "ریال"},
              {"key": "percent", "symbol": "percent", "dimension": "dimensionless", "factor_to_base": 0.01, "unit_title": "درصد"}]}))
# carton/pack factor is "per item" — represented as absent, not null, so the config record stays confirmed
for r in E[-1]["data"]["rows"]:
    if r["factor_to_base"] is None:
        r.pop("factor_to_base")

E.append(entry("F-00018", "record", "pos_sepidz", "صندوق (سپیدز)", "سامانهٔ فروش؛ فیش فروش، فیش ضایعات و فیش تست غذا از اینجا صادر می‌شود و تعداد فروش به شیت بارگذاری می‌شود.",
    scope(["cashier"]), [src("voice", T0526, RUN_COOK, lines="312-320"), src("pdf", PDF_KITCHEN, RUN_COOK2, page="14")],
    {"medium": "external", "role": "log", "location": {"identifier_scheme": {"authority": "Sepidz", "format": "receipt number", "example": "R-140509-0231"}},
     "grain": "هر فیش یک فروش/ضایعات/تست", "cadence": "ad_hoc", "fields": [], "rows": []}))

E.append(entry("F-00019", "record", "anbar__issue_to_prep", "خروجی انبار به آماده‌سازی", "دفتر انتقال مواد از انبار به آماده‌سازی؛ هر ردیف یک تاریخ.",
    scope(["warehouse"]), [src("sheet", ANBAR, RUN_MGMT, sheet="خروجی انبار به آماده سازی", cell="A2:L2"),
                           src("comment", ANBAR, RUN_MGMT, sheet="خروجی انبار به آماده سازی", cell="L452")],
    {"medium": "sheet", "role": "log", "location": {"spreadsheetId": "1kQwErTyUiOpAsDfGhJkLzXcVbNm123456", "sheetId": 3, "sheet": "خروجی انبار به آماده سازی", "hidden": False},
     "grain": "هر ردیف یک روز", "cadence": "daily",
     "movement": {"from": ref("F-00008"), "to": ref("F-00009"), "reason": "تحویل روزانهٔ مواد خام برای تبدیل"},
     "fields": [{"key": "date", "title": "تاریخ", "type": "date"}, {"key": "raste_in", "title": "راسته (وزن)", "type": "number", "unit": "kg", "group": {"key": "meat", "title": "گوشت (وزن)"}},
                {"key": "chicken_in", "title": "مرغ (وزن)", "type": "number", "unit": "kg", "group": {"key": "chicken", "title": "مرغ (وزن)"}}],
     "primaryKey": ["date"], "rows": [], "foreignKeys": []}))

E.append(entry("F-00020", "record", "hesabdari__sales_targets", "اهداف فروش", "جدول هدف فروش ماهانه به تفکیک شعبه و کانال (سالن/بیرون‌بر)؛ سربرگ دو ردیفه که ردیف اول شعبه است.",
    scope(["accounting"]), [src("sheet", HESABDARI, RUN_MGMT, sheet="اهداف فروش", cell="A1:G2"), src("docx", DOCX_ACC, RUN_MGMT),
                            src("process", PROC_ACC3, RUN_MGMT, node="accounting-003-n004", quote="هدف فروش ماهانهٔ هر شعبه در جدول اهداف فروش ثبت می‌شود")],
    {"medium": "sheet", "role": "log", "location": {"spreadsheetId": "1HeSaBdArI9xY8wV7uT6sR5qP4oN3mL2k", "sheetId": 6, "sheet": "اهداف فروش", "hidden": False},
     "grain": "هر ردیف یک ماه", "cadence": "monthly",
     "fields": [{"key": "month", "title": "ماه", "type": "string"}, {"key": "year", "title": "سال", "type": "integer"},
                {"key": "target_salon_cb", "title": "هدف فروش سالن", "type": "number", "unit": "irr", "group": {"key": "chalebagh", "title": "هدف فروش شعبه چاله باغ"}},
                {"key": "target_birunbar_cb", "title": "هدف فروش بیرون‌بر", "type": "number", "unit": "irr", "group": {"key": "chalebagh", "title": "هدف فروش شعبه چاله باغ"}},
                {"key": "target_salon_nk", "title": "هدف فروش سالن", "type": "number", "unit": "irr", "group": {"key": "naharkhoran", "title": "هدف فروش شعبه ناهارخوران"}},
                {"key": "target_birunbar_nk", "title": "هدف فروش بیرون‌بر", "type": "number", "unit": "irr", "group": {"key": "naharkhoran", "title": "هدف فروش شعبه ناهارخوران"}}],
     "primaryKey": ["month", "year"], "rows": [], "foreignKeys": []},
    processes=[ref("accounting-003")]))

E.append(entry("F-00021", "record", "pitza_nk__end_of_night", "موجودی آخر شب — پیتزا (ناهارخوران)",
    "پیش‌ثبت: برگه‌ای که گزارش ناهارخوران به آن ارجاع می‌دهد و هنوز خوانده نشده است.",
    scope(["cooking"], ["naharkhoran"]), [src("sheet", GOZARESH_NK, RUN_MGMT, sheet="Table_Pizza_Last", cell="A1")],
    {"medium": "sheet", "role": "log", "location": {"spreadsheetId": "1PiTzAnK7yX6wV5uT4sR3qP2oN1mL0kJ9", "sheetId": 2, "sheet": "موجودی آخر شب", "hidden": False},
     "stub": True, "rows": []}))

E.append(entry("F-00022", "record", "ext_3f9a1c2e7b4d", "کاربرگ ناشناخته 1QzX…", "پیش‌ثبت کاربرگ: شناسه‌ای که از فرمول ارجاع شده و در مانیفست نیست.",
    scope(["management"]), [src("sheet", GOZARESH_CB, RUN_MGMT, sheet="SheetsFileIDs", cell="B9")],
    {"medium": "sheet", "role": "log", "location": {"spreadsheetId": "1QzXcVbNmAsDfGhJkLpOiUyTrEwQ0987654"}, "stub": True, "grain": "workbook", "rows": []}))

E.append(entry("F-00047", "record", "tedade_cb__pizza_sales", "تعداد فروش — پیتزا (چاله‌باغ)", "تعداد فروش هر محصول در هر شب، بارگذاری‌شده از خروجی صندوق با کد محصول.",
    scope(["accounting"], ["chalebagh"]), [src("script", GS_SALES, RUN_MGMT, function="updateFoodCount")],
    {"medium": "sheet", "role": "log", "location": {"spreadsheetId": "1AIjHsWqErTyUiOpAsDfGhJkLzXcVbNm12", "sheetId": 3, "sheet": "Pizza", "hidden": False},
     "grain": "هر ردیف یک شب", "cadence": "nightly",
     "fields": [{"key": "date", "title": "تاریخ", "type": "date"},
                {"key": "product", "title": "کد محصول", "type": "string", "refItems": {"namespace": "#", "resolved_by": "code"}},
                {"key": "count", "title": "تعداد فروش", "type": "integer", "unit": "pcs"}],
     "primaryKey": ["date", "product"], "rows": [], "foreignKeys": [{"fields": ["product"], "reference": ref("F-00018"), "reference_fields": ["product_code"]}]}))

# ---- measurements ----------------------------------------------------------------
E.append(entry("F-00023", "measurement", "ing_1__pitza_cb__end_of_night__end_stock", "وزن‌کشی پنیر پیتزا در پایان شب",
    "سرلاین پیتزا از ساعت ۱:۱۵ همهٔ اقلام وزنی را وزن می‌کند؛ کارتن‌ها به تعداد × وزن اسمی، فله با ترازو، به گرم.",
    scope(["cooking"], ["chalebagh"]), [src("voice", T0526, RUN_COOK, lines="92-107"),
                                        src("process", PROC_COOK1, RUN_COOK, node="cooking-001-n010", quote="در پایان شیفت، سرلاین موجودی پنیر را وزن می‌کند و در برگهٔ آخر شب می‌نویسد")],
    {"of": ref("F-00001"), "quantity": "mass", "unit": "g", "method": "ترازو؛ کارتن بر اساس تعداد × وزن اسمی", "when": "پایان شیفت، از ۱:۱۵",
     "by": "سرلاین", "writes_to": ref("F-00013", "end_stock"), "exceptions": "آرد وزن نمی‌شود"},
    processes=[ref("cooking-001")]))

E.append(entry("F-00024", "measurement", "ing_15__mande_shab_farangi_burger__end_stock", "ثبت وزنی بیکن در مانده شب فرنگی",
    "بیکن با اینکه به تعداد دریافت می‌شود، در مانده شب به وزن ثبت می‌شود تا ورق‌ها شمرده نشوند.",
    scope(["cooking"]), [src("voice", T0526, RUN_COOK, lines="188")],
    {"of": ref("F-00003"), "quantity": "mass", "unit": "g", "method": "ترازو", "when": "پایان شیفت", "by": "مسئول واحد",
     "writes_to": ref("F-00011", "end_stock")},
    field_status={"data/method": "inferred"}))

E.append(entry("F-00025", "measurement", "verbal_oil_change_report", "گزارش شفاهی تعویض روغن", "مسئول سوخاری شفاهی می‌گوید کدام سرخ‌کن تعویض شده؛ جایی ثبت نمی‌شود.",
    scope(["cooking"]), [src("voice", T0526, RUN_COOK, lines="270")],
    {"of": ref("F-00048"), "quantity": "volume", "unit": "l", "method": "چشمی", "when": "هر دو شب", "by": "مسئول سوخاری"},
    field_status={"data/method": "informal", "data/when": "informal"}))

E.append(entry("F-00048", "item", "ing_77", "روغن سرخ‌کردنی", "روغن سرخ‌کن؛ مهم‌ترین مادهٔ مصرفی سوخاری که در مانده شب ثبت نمی‌شود.",
    scope(["cooking"]), [src("voice", T0526, RUN_COOK, lines="270"), src("pdf", PDF_KITCHEN, RUN_COOK2, page="11")],
    {"code": "##77", "code_absent": False, "category": "consumable", "group": "oil", "unit": "l", "unit_raw": "لیتر", "units": [{"pack_unit": "pack", "factor_to_base": 17}],
     "pack": {"size": 17, "unit": "l"},
     "tracked": [{"record": ref("F-00013"), "value": False, "reason": "جذب، پاشش و خروج همراه غذا مصرف را غیرقابل تطبیق می‌کند"}]}))

# ---- rules ------------------------------------------------------------------------
E.append(entry("F-00026", "rule", "gozaresh_cb__pizza__deviation_tol__tolerance_per_food_gr", "تلورانس هر واحد — پیتزا",
    "تلورانس مجاز انحراف به ازای هر واحد فروش، ۵ گرم؛ از فرمول ستون L گزارش مرکزی.",
    scope(["management"], ["chalebagh"]), [src("sheet", GOZARESH_CB, RUN_MGMT, sheet="پیتزا", cell="L6")],
    {"inputs": [], "outputs": [{"key": "tolerance_g", "unit": "g", "per": "unit_sold", "nature": "limit", "value": 5}],
     "calls": [], "port": False, "edge_cases": []}))

E.append(entry("F-00027", "rule", "raw_equivalent_factor_grilled_chicken", "ضریب تبدیل مرغ پخته به خام",
    "مرغ خام تحویل می‌شود و پخته باقی می‌ماند؛ افت پخت ۲۸ تا ۳۲ درصد اندازه‌گیری شده و برای کنترل ۳۰ درصد (ضریب ۱٫۳۰) قرار داده شده است.",
    scope(["cooking"]), [src("voice", T0522, RUN_COOK, lines="546"), src("voice", T0526, RUN_COOK, lines="155-173"), src("pdf", PDF_KITCHEN, RUN_COOK2, page="7-8")],
    {"inputs": [], "outputs": [{"key": "factor", "unit": "ratio", "per": "kg_cooked", "of": ref("F-00049"), "nature": "standard", "value": 1.30},
                               {"key": "loss_share", "unit": "ratio", "nature": "observed", "range": {"min": 0.28, "max": 0.32}}],
     "calls": [], "port": False, "edge_cases": []},
    aliases=["۳۰ درصد اضافه"], processes=[ref("cooking-001")]))

E.append(entry("F-00049", "item", "ing_18", "مرغ گریل / مرغ پاستا", "سینهٔ مرغ که خام تحویل و در فرنگی گریل می‌شود.",
    scope(["cooking"]), [src("voice", T0526, RUN_COOK, lines="155")],
    {"code": "##18", "code_absent": False, "category": "ingredient", "group": "chicken", "state": "cooked", "unit": "g", "units": [], "tracked": []}))

E.append(entry("F-00028", "rule", "deviation_tolerance_lugme", "تلورانس انحراف لقمه", "حد مجاز انحراف تعداد لقمه؛ در جلسه گفته شد ۴ و ۷ شاید در تلورانس باشد و −۱۱۰ مجاز نیست، اما عددی تعیین نشد.",
    scope(["cooking"]), [src("voice", T0601, RUN_COOK, lines="11")],
    {"inputs": [], "outputs": [{"key": "tolerance_pcs", "unit": "pcs", "per": "night", "nature": "limit", "value": None}],
     "calls": [], "port": False, "edge_cases": []}))

E.append(entry("F-00029", "rule", "recheck_threshold_pieces", "آستانهٔ بازشماری", "عرفاً وقتی انحراف به حدود ۳۰۰ عدد می‌رسد، می‌گویند دوباره بشمارید.",
    scope(["cooking"]), [src("voice", T0601, RUN_COOK, lines="27")],
    {"inputs": [], "outputs": [{"key": "threshold_pcs", "unit": "pcs", "per": "night", "nature": "limit", "value": 300}],
     "calls": [], "port": False, "edge_cases": []},
    field_status={"data/outputs/threshold_pcs/value": "informal"}))

E.append(entry("F-00030", "rule", "gozaresh_cb__pizza__declared_use", "مصرف اعلامی پیتزا",
    "مصرف اعلامی = موجودی اول شب + دریافت از انبار − موجودی آخر شب",
    scope(["management"], ["chalebagh"]),
    [src("sheet", GOZARESH_CB, RUN_MGMT, sheet="پیتزا", cell="H6"), src("voice", T0601, RUN_COOK, lines="40"),
     src("process", PROC_COOK1, RUN_COOK, node="cooking-001-n010", quote="مصرف اعلامی از مانده اول شب، دریافت از انبار و مانده آخر شب محاسبه می‌شود")],
    {"inputs": [{"key": "start", "unit": "kg", "from": ref("F-00016", "start_stock")},
                {"key": "received", "unit": "kg", "from": ref("F-00016", "received")},
                {"key": "end", "unit": "kg", "from": ref("F-00016", "end_stock")}],
     "outputs": [{"key": "declared_use", "unit": "kg", "nature": "observed", "writes_to": ref("F-00016", "declared_use")}],
     "expr": "declared_use = start + received - end", "lang": "feel", "original_ref": "facts/originals/F-00030.txt",
     "calls": [], "port": False, "edge_cases": []},
    aliases=["مصرف اعلام‌شده"],
    accounts=[account("data/expr", "=MINUS(SUM(F6,E6),G6)", "declared_use = start + received - end",
                      src("sheet", GOZARESH_CB, RUN_MGMT, sheet="پیتزا", cell="H6")),
              account("data/expr", "ببینید مصرف اعلامیشون در واقع تفاوت بین مانده اول شب و آخر شبشونه خب؟ که این میزان مصرف انبار ازش کم می‌شه.",
                      "declared_use = start - end - received", src("voice", T0601, RUN_COOK, lines="40"))],
    processes=[ref("cooking-001")]))

E.append(entry("F-00031", "rule", "gozaresh_cb__pizza__standard_use", "مصرف استاندارد پیتزا",
    "مصرف استاندارد = مجموع (تعداد فروش هر محصول × گرم مادهٔ اولیه در آن محصول) روی BOM.",
    scope(["management"], ["chalebagh"]), [src("sheet", GOZARESH_CB, RUN_MGMT, sheet="پیتزا", cell="I6"), src("script", GS_CB, RUN_MGMT, function="getTotalFoodsIngredient")],
    {"inputs": [{"key": "bom", "unit": "g", "from": ref("F-00014", "grams")},
                {"key": "sales", "unit": "pcs", "from": ref("F-00047", "count")}],
     "outputs": [{"key": "standard_use", "unit": "g", "nature": "standard", "writes_to": ref("F-00016", "actual_use")}],
     "expr": "standard_use = sum over bom of (sales.count * bom.grams)", "lang": "feel", "original_ref": "facts/originals/F-00031.txt",
     "calls": [ref("F-00036")], "port": False, "edge_cases": []}))

E.append(entry("F-00032", "rule", "weekday_coefficient", "ضریب روز هفته", "ضریب سفارش بر اساس روز هفته: چهارشنبه ۱٫۱، پنجشنبه ۱٫۲، جمعه ۱٫۱۵، سایر روزها ۱.",
    scope(["management"]), [src("script", GS_DASH, RUN_MGMT, function="getWeekDayCoefficient")],
    {"inputs": [{"key": "weekday", "unit": "pcs", "from": "calendar"}],
     "outputs": [{"key": "coefficient", "unit": "ratio", "nature": "standard"}],
     "lang": "table", "original_ref": "facts/originals/F-00032.txt",
     "table": {"inputs": ["weekday"], "outputs": ["coefficient"], "hit": "first", "default": {"coefficient": 1.0},
               "rows": [{"when": {"weekday": "wed"}, "then": {"coefficient": 1.1}}, {"when": {"weekday": "thu"}, "then": {"coefficient": 1.2}},
                        {"when": {"weekday": "fri"}, "then": {"coefficient": 1.15}}]},
     "calls": [], "port": False, "edge_cases": []}))

E.append(entry("F-00033", "rule", "event_coefficients", "ضرایب رویداد", "چهار ضریب رویداد که اپراتور هنگام ثبت سفارش انتخاب می‌کند و در هم ضرب می‌شوند.",
    scope(["management"]), [src("script", GS_DASH, RUN_MGMT, function="saveOrders")],
    {"inputs": [{"key": "events", "unit": "pcs", "from": "operator"}],
     "outputs": [{"key": "coefficient", "unit": "ratio", "nature": "standard"}],
     "lang": "table", "original_ref": "facts/originals/F-00033.txt",
     "table": {"inputs": ["events"], "outputs": ["coefficient"], "hit": "collect", "aggregate": "product", "default": {"coefficient": 1.0},
               "rows": [{"when": {"events": "tomorrow_holiday"}, "then": {"coefficient": 1.10}}, {"when": {"events": "mourning"}, "then": {"coefficient": 0.90}},
                        {"when": {"events": "ramadan"}, "then": {"coefficient": 0.80}}, {"when": {"events": "competitor_holiday"}, "then": {"coefficient": 1.05}}]},
     "calls": [], "port": False, "edge_cases": []}))

E.append(entry("F-00034", "rule", "tracking_policy_rial_value", "سیاست ردیابی بر اساس ارزش ریالی",
    "معیار ما برای اندازه‌گیری مواد، آیتم‌ها، میزان اهمیت و ارزش ریالیشونه؛ اقلام کم‌ارزش (قاشق سس، بسته‌بندی) در مانده شب ثبت نمی‌شوند.",
    scope(["cooking"]), [src("voice", T0526, RUN_COOK, lines="55-62"), src("pdf", PDF_KITCHEN, RUN_COOK2, page="3-4")],
    {"inputs": [{"key": "threshold", "unit": "irr", "from": ref("F-00035")}], "outputs": [{"key": "tracked", "unit": "pcs", "nature": "standard"}],
     "lang": "text", "original_ref": "facts/originals/F-00034.txt", "calls": [], "port": False, "edge_cases": []},
    processes=[ref("cooking-001")]))

E.append(entry("F-00035", "rule", "tracking_threshold_irr", "آستانهٔ ریالی ردیابی", "ارزشی که زیر آن قلم در مانده شب ثبت نمی‌شود؛ هرگز عددی گفته نشد.",
    scope(["cooking"]), [src("voice", T0526, RUN_COOK, lines="57")],
    {"inputs": [], "outputs": [{"key": "threshold", "unit": "irr", "per": "kg", "nature": "limit", "value": None}], "calls": [], "port": False, "edge_cases": []}))

E.append(entry("F-00036", "rule", "get_value_by_id", "getValueById", "ستون را با جستجوی زیررشته‌ای «#کد» در سربرگ پیدا می‌کند و مقدار اولین ردیف نتیجه را برمی‌گرداند.",
    scope(), [src("script", GS_CB, RUN_MGMT, function="getValueById")],
    {"inputs": [{"key": "id", "unit": "pcs", "from": "operator"}, {"key": "data", "unit": "pcs", "from": ref("F-00015", "end_stock")}],
     "outputs": [{"key": "value", "unit": "g", "nature": "observed"}],
     "lang": "gs", "identifier": "getValueById", "original_ref": "facts/originals/F-00036.txt", "calls": [], "port": True,
     "edge_cases": [{"input": "id=1 با سربرگ‌های ##1 و ##10", "expected": "اولین سربرگی که «#1» در آن باشد", "why": "تطبیق زیررشته‌ای، اولین برد"},
                    {"input": "کد یافت نشد", "expected": "رشتهٔ \"ID not found\"", "why": "خروجی رشته‌ای نه خطا"},
                    {"input": "سلول \"#N/A\"", "expected": "0", "why": "این بدنه #N/A را صفر می‌کند"}]}))

E.append(entry("F-00037", "rule", "get_value_by_id__gozareshat", "getValueById (داشبورد)", "همان تابع با بدنه‌ای که به‌جای #N/A، رشتهٔ خالی را صفر می‌کند.",
    scope(["management"]), [src("script", GS_DASH, RUN_MGMT, function="getValueById")],
    {"inputs": [{"key": "id", "unit": "pcs", "from": "operator"}, {"key": "data", "unit": "pcs", "from": ref("F-00015", "end_stock")}],
     "outputs": [{"key": "value", "unit": "g", "nature": "observed"}],
     "lang": "gs", "identifier": "getValueById", "original_ref": "facts/originals/F-00037.txt", "calls": [], "port": True,
     "template_of": ref("F-00036"), "divergence": "drift",
     "edge_cases": [{"input": "سلول خالی", "expected": "0", "why": "این بدنه \"\" را صفر می‌کند و #N/A را عبور می‌دهد"}]}))

E.append(entry("F-00038", "rule", "gozaresh_nk__pizza__declared_use", "مصرف اعلامی پیتزا (ناهارخوران)", "همان فرمول گزارش چاله‌باغ در کاربرگ ناهارخوران.",
    scope(["management"], ["naharkhoran"]), [src("sheet", GOZARESH_NK, RUN_MGMT, sheet="پیتزا", cell="H6")],
    {"inputs": [{"key": "start", "unit": "kg", "from": ref("F-00021", "start_stock")}, {"key": "received", "unit": "kg", "from": ref("F-00021", "received")},
                {"key": "end", "unit": "kg", "from": ref("F-00021", "end_stock")}],
     "outputs": [{"key": "declared_use", "unit": "kg", "nature": "observed"}],
     "expr": "declared_use = start + received - end", "lang": "feel", "original_ref": "facts/originals/F-00038.txt",
     "template_of": ref("F-00030"), "divergence": "none", "calls": [], "port": False, "edge_cases": []}))

E.append(entry("F-00039", "rule", "raste_yield", "بازدهی راسته", "۲۹٫۲ کیلو راسته به استیک رولی، فیلادلفیا، خرده راسته و ضایعات تبدیل می‌شود؛ سهم‌ها لات به لات فرق می‌کند.",
    scope(["preparation"]), [src("comment", ANBAR, RUN_PREP, sheet="خروجی انبار به آماده سازی", cell="L452"), src("voice", TPREP, RUN_PREP, lines="107")],
    {"inputs": [{"key": "input_kg", "unit": "kg", "from": ref("F-00019", "raste_in")}],
     "outputs": [{"key": "steak_roll", "unit": "kg", "nature": "observed", "share": 0.356},
                 {"key": "philadelphia", "unit": "kg", "nature": "observed", "share": 0.185},
                 {"key": "trimmings", "unit": "kg", "nature": "observed", "share": 0.384},
                 {"key": "waste", "unit": "kg", "nature": "observed", "share": 0.061}],
     "expr": "steak_roll = input_kg * 0.356; philadelphia = input_kg * 0.185; trimmings = input_kg * 0.384; waste = input_kg * 0.061",
     "lang": "feel", "original_ref": "facts/originals/F-00039.txt", "calls": [], "port": False, "edge_cases": []},
    field_status={"data/outputs/steak_roll/share": "informal", "data/outputs/philadelphia/share": "informal",
                  "data/outputs/trimmings/share": "informal", "data/outputs/waste/share": "informal"}))

E.append(entry("F-00040", "rule", "salon_cb__receipts__deviation", "انحراف تعداد فیش — سالن چاله‌باغ", "فرمول شیت که هدف روز را از «اهداف فروش» می‌خواند و از تعداد فیش کم می‌کند.",
    scope(["dining"], ["chalebagh"]), [src("sheet", SALON_CB, RUN_MGMT, sheet="تعداد فیش هرشب", cell="B3")],
    {"inputs": [{"key": "receipts", "unit": "pcs", "from": ref("F-00047", "count")}, {"key": "target", "unit": "pcs", "from": ref("F-00020", "target_salon_cb")}],
     "outputs": [{"key": "deviation", "unit": "pcs", "nature": "observed"}],
     "lang": "sheets", "original_ref": "facts/originals/F-00040.txt", "calls": [ref("F-00036")], "port": False, "edge_cases": []},
    issues=[{"kind": "bug", "field": "data/original_ref", "from_date": "1404-07-01", "description": "«اهداف فروش» فقط یک ردیف (مهر ۱۴۰۴) دارد؛ فرمول برای سایر ماه‌ها #N/A می‌دهد.", "affects": [ref("F-00020")]}]))

E.append(entry("F-00041", "rule", "order_packs_from_par", "محاسبهٔ سفارش پنه بر اساس پرس", "تعداد بستهٔ سفارش = (پرس مورد نیاز روز − پرس موجود) ÷ پرس در هر بسته.",
    scope(["cooking"]), [src("voice", T0526, RUN_COOK, lines="212-218"), src("pdf", PDF_KITCHEN, RUN_COOK2, page="9")],
    {"inputs": [{"key": "par", "unit": "portion", "from": ref("F-00050")}, {"key": "stock_packs", "unit": "pack", "from": ref("F-00012", "requested"), "via": ref("F-00051")},
                {"key": "weekday", "unit": "pcs", "from": "calendar"}],
     "outputs": [{"key": "order_packs", "unit": "pack", "nature": "standard"}],
     "expr": "order_packs = round((par - stock_packs) / 5)", "lang": "feel", "original_ref": "facts/originals/F-00041.txt",
     "calls": [ref("F-00050")], "port": False, "edge_cases": []}))

E.append(entry("F-00050", "rule", "par_portions_penne_by_weekday", "حد نگهداری پنه بر اساس روز هفته", "روز عادی ۴۰ پرس، پنجشنبه و جمعه ۶۵ پرس.",
    scope(["cooking"]), [src("voice", T0526, RUN_COOK, lines="212")],
    {"inputs": [{"key": "weekday", "unit": "pcs", "from": "calendar"}], "outputs": [{"key": "par", "unit": "portion", "nature": "target"}],
     "lang": "table", "table": {"inputs": ["weekday"], "outputs": ["par"], "hit": "first", "default": {"par": 40},
                                "rows": [{"when": {"weekday": "thu"}, "then": {"par": 65}}, {"when": {"weekday": "fri"}, "then": {"par": 65}}]},
     "calls": [], "port": False, "edge_cases": []}))

E.append(entry("F-00051", "rule", "portions_per_pack_penne", "پرس در هر بستهٔ پنه", "بستهٔ ۱۲۰۰ گرمی ÷ پرس ۲۴۰ گرمی = ۵ پرس.",
    scope(["cooking"]), [src("voice", T0526, RUN_COOK, lines="218")],
    {"inputs": [], "outputs": [{"key": "portions", "unit": "portion", "per": "pack", "nature": "standard", "value": 5}], "calls": [], "port": False, "edge_cases": []}))

E.append(entry("F-00042", "rule", "pack_g_parmesan", "وزن بستهٔ پارمسان", "پارمسان در بسته‌های ۲۰۰ گرمی می‌آمد.",
    scope(["cooking"]), [src("voice", T0526, RUN_COOK, lines="149")],
    {"inputs": [], "outputs": [{"key": "pack_g", "unit": "g", "per": "pack", "nature": "standard", "value": 200}], "calls": [], "port": False, "edge_cases": []},
    valid_from="1404-01-01", valid_to="1405-05-26", superseded_by=ref("F-00043"), updated_at="2026-09-02T15:31:00Z"))

E.append(entry("F-00043", "rule", "pack_g_parmesan", "وزن بستهٔ پارمسان", "پارمسان اکنون در بسته‌های ۱۰۰ گرمی می‌آید («۲۰۰ بود الان ۱۰۰ گرمی شده»).",
    scope(["cooking"]), [src("voice", T0526, RUN_COOK, lines="155")],
    {"inputs": [], "outputs": [{"key": "pack_g", "unit": "g", "per": "pack", "nature": "standard", "value": 100}], "calls": [], "port": False, "edge_cases": []},
    valid_from="1405-05-26", supersedes=ref("F-00042")))

E.append(entry("F-00044", "rule", "start_stock_carryover", "مانده اول شب = مانده آخر شب دیشب", "موجودی اول شب هر روز همان موجودی آخر شب روز قبل است، به‌علاوهٔ دریافتی انبار.",
    scope(["cooking"]), [src("voice", T0601, RUN_COOK, lines="52-60"),
                         src("process", PROC_COOK2, RUN_COOK, node="cooking-002-n003", quote="مانده اول شب از برگهٔ شب قبل برداشته می‌شود")],
    {"inputs": [{"key": "end_prev", "unit": "kg", "from": ref("F-00013", "end_stock")}],
     "outputs": [{"key": "start", "unit": "kg", "nature": "observed", "writes_to": ref("F-00016", "start_stock")}],
     "expr": "start = end_prev", "lang": "feel", "original_ref": "facts/originals/F-00044.txt", "calls": [], "port": False, "edge_cases": []},
    processes=[ref("cooking-002")]))

E.append(entry("F-00046", "rule", "gozaresh_cb__mavad__dough_single_literal", "ضریب خمیر سینگل در گزارش", "گزارش مرکزی خمیر پیتزای سینگل را در ۱ ضرب می‌کند؛ BOM می‌گوید ۱۸۰ گرم.",
    scope(["management"]), [src("sheet", "attachments/sheets/Gozareshat/Gozareshat.xlsx", RUN_MGMT, sheet="مواد اولیه", cell="P31")],
    {"inputs": [], "outputs": [{"key": "dough_g", "unit": "g", "per": "pizza", "nature": "standard", "value": 1}], "calls": [], "port": False, "edge_cases": []},
    issues=[{"kind": "bug", "field": "data/outputs/dough_g/value", "description": "مقدار ۱ با ۱۸۰ گرم BOM نمی‌خواند؛ احتمالاً ضریب فراموش‌شده.", "affects": [ref("F-00014")]}]))

# ---- notes ------------------------------------------------------------------------
E.append(entry("F-00045", "note", "note_4c1f0a9d2b7e", "استیک یخ‌زده برش می‌خورد",
    "استیک نیم‌پز به انبار می‌رود، منجمد می‌شود، برای مصرف برمی‌گردد و یخ‌زده برش می‌خورد؛ خونابه بعد از ماندن در یخچال تا آخر شب پس می‌دهد.",
    scope(["cooking"]), [src("voice", T0526, RUN_COOK, lines="107-116")], {}))

E.append(entry("F-00052", "note", "note_9a2b3c4d5e6f", "کدهای ۷۱ تا ۸۷ با تابع AI تولید شده‌اند",
    "کدهای ۷۱ تا ۸۷ در «مواد عادی» با تابع AI() شیت تولید شده‌اند و با محدودهٔ محصولات #71..#87 هم‌پوشانی دارند.",
    scope(), [src("sheet", "attachments/sheets/MandeShab__control__Gozareshat/Gozareshat.xlsx", RUN_MGMT, sheet="مواد عادی", cell="D71")], {}))

# The parmesan pack size should also live on the item; give it one more entry to show item.pack supersession in the UI.
E.append(entry("F-00053", "item", "ing_9", "پنیر پارمسان", "پارمسان بسته‌ای؛ مانده بر اساس وزن ثبت می‌شود.",
    scope(["cooking"]), [src("voice", T0526, RUN_COOK, lines="149-155")],
    {"code": "##9", "code_absent": False, "category": "ingredient", "group": "cheese", "unit": "g", "units": [{"pack_unit": "pack", "factor_to_base": 100}],
     "pack": {"size": 100, "unit": "g"}, "tracked": []},
    updated_at="2026-09-15T11:00:00Z"))

E.append(entry("F-00054", "item", "ing_26", "خمیر پیتزا", "خمیر پیتزا؛ ایتالیایی ۲۸۰ گرم، امریکایی ۲۳۰ گرم، سینگل ۱۸۰ گرم به ازای هر پیتزا (BOM).",
    scope(), [src("sheet", MAVAD, RUN_MGMT, sheet="پیتزا ایتالیایی", cell="L1")],
    {"code": "##26", "code_absent": False, "category": "ingredient", "group": "dough", "state": "prepared", "unit": "g", "unit_raw": "گرم", "units": [], "tracked": []}))

for e in E:
    e["status"] = derive_status(e)

# ---------------------------------------------------------------------------
# Confirmations (app.db) — which entries are ticked, and with which fingerprint
# ---------------------------------------------------------------------------
BY_ID = {e["id"]: e for e in E}

confirmed_ids_matching = ["F-00001", "F-00003", "F-00007", "F-00008", "F-00009", "F-00012", "F-00013", "F-00015", "F-00017", "F-00018",
                          "F-00019", "F-00023", "F-00026", "F-00027", "F-00031", "F-00032", "F-00033", "F-00034", "F-00036", "F-00038",
                          "F-00039", "F-00041", "F-00050", "F-00051", "F-00043", "F-00044", "F-00047", "F-00049", "F-00052", "F-00048"]
stale_ids = {"F-00005": "2026-09-15T11:02:00Z", "F-00053": "2026-09-15T11:00:00Z", "F-00042": "2026-09-02T15:31:00Z"}

confirmations = []
for id_ in confirmed_ids_matching:
    confirmations.append({"target": id_, "fingerprint": fingerprint(BY_ID[id_]), "confirmed_by": "lili",
                          "confirmed_at": "2026-09-10T09:00:00Z", "data_repo_commit": "ecd6aa0"})
for id_, changed_at in stale_ids.items():
    confirmations.append({"target": id_, "fingerprint": "sha256:" + "0" * 64, "confirmed_by": "lili",
                          "confirmed_at": "2026-09-05T09:00:00Z", "data_repo_commit": "0f60b69"})

CONF = {c["target"]: c for c in confirmations}

# ---------------------------------------------------------------------------
# Processes referenced (for orphan states)
# ---------------------------------------------------------------------------
PROCESSES = {
    "cooking-001": {"id": "cooking-001", "title": "وزن‌کشی و ثبت مانده شب پیتزا", "tombstoned": False, "superseded_by": None,
                    "nodes": ["cooking-001-n010", "cooking-001-n011"]},
    "cooking-002": {"id": "cooking-002", "title": "آماده‌سازی ابتدای شیفت", "tombstoned": False, "superseded_by": None,
                    "nodes": ["cooking-002-n001", "cooking-002-n002"]},  # n003 was removed by a restructure
    "accounting-003": {"id": "accounting-003", "title": "تعیین اهداف فروش", "tombstoned": True, "superseded_by": "accounting-011",
                       "nodes": []},
    "accounting-011": {"id": "accounting-011", "title": "برنامه‌ریزی فروش ماهانه", "tombstoned": False, "superseded_by": None,
                       "nodes": ["accounting-011-n001"]},
}

# sources whose file moved since citation (merge facts check)
MOVED_SOURCES = {SALON_CB}


def viewer_can_confirm(e, viewer_scopes):
    """Viewer holds `confirm` on these dept scopes; '*' means all. AND over departments (QF-27)."""
    depts = e["scope"]["departments"]
    if "*" in viewer_scopes:
        return True, None
    if not depts:
        return False, "universal"
    if all(d in viewer_scopes for d in depts):
        return True, None
    return False, "other_department"


def confirmation_state(e, viewer_scopes):
    if e["data"].get("stub"):
        return {"state": "stub", "label": "پیش‌ثبت", "can_confirm": False, "reason": "stub"}
    row = CONF.get(e["id"])
    red = e["status"] in ("disputed", "unknown")
    can, reason = viewer_can_confirm(e, viewer_scopes)
    base = {"confirmed_by": row["confirmed_by"] if row else None, "confirmed_at": row["confirmed_at"] if row else None,
            "fingerprint": fingerprint(e), "can_confirm": can and not red, "reason": ("red" if red else reason)}
    if red:
        base.update(state="red_disputed" if e["status"] == "disputed" else "red_unknown",
                    label="متعارض" if e["status"] == "disputed" else "بی‌پاسخ")
        return base
    if not can and reason == "universal":
        base.update(state="universal", label="نیازمند تأیید سراسری")
        return base
    if row and row["fingerprint"] == fingerprint(e):
        base.update(state="green", label="تأییدشده")
        return base
    if row:
        base.update(state="stale", label="تغییرکرده پس از تأیید", stale_since=e["updated_at"])
        return base
    base.update(state="amber", label="تأییدنشده")
    return base


def orphans(e):
    out = []
    for p in e["processes"]:
        pr = PROCESSES.get(p["ref"])
        if pr is None:
            out.append({"class": "orphan_ref", "label": "ارجاع بی‌مقصد", "ref": p["ref"]})
        elif pr["tombstoned"]:
            out.append({"class": "process_tombstoned", "label": "اشاره به فرایند بازنشسته", "ref": p["ref"], "heir": pr["superseded_by"],
                        "heir_title": PROCESSES[pr["superseded_by"]]["title"] if pr["superseded_by"] else None})
    for s in e["source"]:
        if s["type"] == "process":
            pr = PROCESSES.get(s["ref"].split("/")[-1].replace(".json", ""))
            if pr and not pr["tombstoned"] and s["node"] not in pr["nodes"]:
                out.append({"class": "node_gone", "label": "گرهٔ ارجاع‌شده حذف شده", "ref": s["ref"], "node": s["node"]})
        if s["ref"] in MOVED_SOURCES:
            out.append({"class": "moved_source", "label": "منبع تغییرکرده", "ref": s["ref"]})
    return out


def red_paths(e):
    return {"unknown": null_leaves(e["data"]), "disputed": sorted({a["field"] for a in e["accounts"] if a["status"] == "open"})}


def consumers(target_id):
    out = []
    for e in E:
        d = e["data"]
        hits = []
        for i in d.get("inputs", []):
            if isinstance(i.get("from"), dict) and i["from"]["ref"] == target_id:
                hits.append("inputs/" + i["key"])
            if isinstance(i.get("via"), dict) and i["via"]["ref"] == target_id:
                hits.append("via/" + i["key"])
        for c in d.get("calls", []):
            if c["ref"] == target_id:
                hits.append("calls")
        for o in d.get("outputs", []):
            if isinstance(o.get("writes_to"), dict) and o["writes_to"]["ref"] == target_id:
                hits.append("writes_to/" + o["key"])
        for f in d.get("fields", []):
            if isinstance(f.get("derived"), dict) and f["derived"]["ref"] == target_id:
                hits.append("fields/" + f["key"] + "/derived")
        if isinstance(d.get("mirror_of"), dict) and d["mirror_of"]["ref"] == target_id:
            hits.append("mirror_of")
        if isinstance(d.get("template_of"), dict) and d["template_of"]["ref"] == target_id:
            hits.append("template_of")
        for rc in d.get("reconciled_against", []):
            if rc["against"]["ref"] == target_id:
                hits.append("reconciled_against")
        if hits:
            out.append({"id": e["id"], "kind": e["kind"], "title": e["title"], "edges": hits})
    return out


def blocker(e):
    rp = red_paths(e)
    if not rp["unknown"] and not rp["disputed"]:
        return False
    return bool(consumers(e["id"]))


# ---------------------------------------------------------------------------
# Write the store
# ---------------------------------------------------------------------------
STORE.mkdir(parents=True, exist_ok=True)
API.mkdir(parents=True, exist_ok=True)


def dump(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


for kind, fname in [("item", "items.json"), ("record", "records.json"), ("measurement", "measurements.json"), ("rule", "rules.json"), ("note", "notes.json")]:
    dump(STORE / fname, {"schema_version": 1, "entries": [e for e in E if e["kind"] == kind]})

index = []
for e in E:
    rp = red_paths(e)
    index.append({"id": e["id"], "kind": e["kind"], "key": e["key"], "title": e["title"], "aliases": e["aliases"], "scope": e["scope"],
                  "status": e["status"],
                  "field_status_counts": {"disputed": len(rp["disputed"]), "unknown": len(rp["unknown"]),
                                          "informal": sum(1 for v in e["field_status"].values() if v == "informal"),
                                          "inferred": sum(1 for v in e["field_status"].values() if v == "inferred")},
                  "processes": [p["ref"] for p in e["processes"]], "retired": e["retired"], "valid_to": e["valid_to"], "updated_at": e["updated_at"]})
dump(STORE / ".index.json", {"schema_version": 1, "entries": index})

dump(STORE / "manifest.json", {
    "schema_version": 1,
    "branches": [{"code": "chalebagh", "name": "چاله‌باغ"}, {"code": "naharkhoran", "name": "ناهارخوران"}],
    "workbooks": [
        {"spreadsheetId": "1dmH8tCqOuqNr2nt4AwJrHC2cq-rv0tIBHc4kk05bWtU", "dir": "MandeShab__ChaleBagh__Amar__Pitza", "file": "Pitza.xlsx", "short": "pitza_cb",
         "scripts": [], "departments": ["cooking"], "branches": ["chalebagh"], "reference_tabs": [], "confirmed": True},
        {"spreadsheetId": "1shXFbKyvEkpA_R6Bf4vSU1Nx_1vAhRxj8lfFYSvtG5s", "dir": "MandeShab__ChaleBagh__Gozaresh markazi", "file": "Gozaresh markazi.xlsx", "short": "gozaresh_cb",
         "scripts": ["MandeShab__ChaleBagh__Gozaresh markazi/Gozaresh markazi.gs"], "departments": ["management"], "branches": ["chalebagh"], "reference_tabs": [], "confirmed": True},
        {"spreadsheetId": "15M2ovUmQ7kX3nR9pLwT2aB8cD4eF6gH1", "dir": "MandeShab__Mavade Avalie", "file": "Mavade Avalie.xlsx", "short": "mavad",
         "scripts": [], "departments": [], "branches": [], "reference_tabs": ["پیتزا ایتالیایی", "پیتزا امریکایی", "پیتزا سینگل"], "confirmed": True},
        {"spreadsheetId": "1PiTzAnK7yX6wV5uT4sR3qP2oN1mL0kJ9", "dir": "MandeShab__Naharkhoran__Amar__Pitza", "file": "Pitza.xlsx", "short": "pitza_nk",
         "scripts": [], "departments": [], "branches": [], "reference_tabs": [], "confirmed": False}]})

# ---------------------------------------------------------------------------
# API view — two viewers: an editor with `*`, and a cooking-only confirm holder
# ---------------------------------------------------------------------------
VIEWERS = {"editor_star": ["*"], "cooking_editor": ["cooking"]}

# Persian titles for rule inputs/outputs (spec §7: every inputs[]/outputs[] member carries `key` and `title`)
IO_TITLES = {
    "start": "موجودی اول شب", "received": "دریافت از انبار", "end": "موجودی آخر شب", "end_prev": "مانده آخر شب دیشب",
    "declared_use": "مصرف اعلامی", "standard_use": "مصرف استاندارد", "bom": "جدول مواد اولیه", "sales": "تعداد فروش",
    "tolerance_g": "تلورانس (گرم)", "tolerance_pcs": "تلورانس (عدد)", "threshold_pcs": "آستانهٔ بازشماری", "threshold": "آستانه",
    "factor": "ضریب تبدیل", "loss_share": "سهم افت پخت", "weekday": "روز هفته", "coefficient": "ضریب", "events": "رویدادها",
    "tracked": "ردیابی می‌شود", "id": "کد", "data": "داده", "value": "مقدار", "input_kg": "ورودی (کیلوگرم)",
    "steak_roll": "استیک رولی", "philadelphia": "فیلادلفیا", "trimmings": "خرده راسته", "waste": "ضایعات",
    "receipts": "تعداد فیش", "target": "هدف", "deviation": "انحراف", "par": "حد نگهداری", "stock_packs": "بسته‌های موجود",
    "order_packs": "بستهٔ سفارش", "portions": "پرس در بسته", "pack_g": "وزن بسته", "dough_g": "خمیر (گرم)",
}
for e in E:
    if e["kind"] == "rule":
        for io in e["data"].get("inputs", []) + e["data"].get("outputs", []):
            if io["key"] not in IO_TITLES:
                raise SystemExit(f"no Persian title for rule input/output key {io['key']!r} in {e['id']}")
            io["title"] = IO_TITLES[io["key"]]
        e["status"] = derive_status(e)  # unchanged, but keep fingerprints computed on the final shape

LEAF_TITLES = {"unit": "واحد", "value": "مقدار", "share": "سهم", "method": "روش", "when": "زمان", "grams": "گرم",
               "expr": "فرمول", "title": "عنوان", "statement": "بیان", "lang": "زبان"}

# labels: every id and every item key → what the UI should show instead of it
LABELS = {}
for e in E:
    lab = {"id": e["id"], "kind": e["kind"], "key": e["key"], "title": e["title"]}
    if e["kind"] == "item" and e["data"].get("code"):
        lab["code"] = e["data"]["code"]
    LABELS[e["id"]] = lab
    if e["kind"] == "item":
        LABELS[e["key"]] = lab
for pid, pr in PROCESSES.items():
    LABELS[pid] = {"id": pid, "kind": "process", "title": pr["title"], "tombstoned": pr["tombstoned"], "superseded_by": pr["superseded_by"]}
dump(API / "labels.json", LABELS)


def resolved_for(e):
    """Everything this entry points at, resolved to a label: {ref} edges, processes[], refItems cells."""
    found = {}

    def walk(o):
        if isinstance(o, dict):
            if "ref" in o and set(o) <= {"ref", "field", "row"} and o["ref"] in LABELS:
                found[o["ref"]] = LABELS[o["ref"]]
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(e["data"])
    walk(e["processes"])
    ref_cols = {f["key"] for f in e["data"].get("fields", []) if "refItems" in f}
    for row in e["data"].get("rows", []):
        for col in ref_cols:
            k = row.get(col)
            if isinstance(k, str) and k in LABELS:
                found[k] = LABELS[k]
    return found


def field_title(e, key):
    for f in e["data"].get("fields", []) + e["data"].get("header_fields", []):
        if f["key"] == key:
            return f["title"]
    for io in e["data"].get("inputs", []) + e["data"].get("outputs", []):
        if io["key"] == key:
            return io["title"]
    return LEAF_TITLES.get(key, key)


def row_titles_for(e):
    """row key → the row's Persian title. Log rows carry one; a reference table's row is composed from
    the titles of its refItems columns in primaryKey order («اینجا پیتزا — خمیر پیتزا»)."""
    d = e["data"]
    ref_cols = [f["key"] for f in d.get("fields", []) if "refItems" in f]
    order = [k for k in d.get("primaryKey", []) if k in ref_cols] or ref_cols
    out = {}
    for row in d.get("rows", []):
        if "title" in row:
            out[row["key"]] = row["title"]
            continue
        parts = [LABELS[row[c]]["title"] for c in order if isinstance(row.get(c), str) and row[c] in LABELS]
        out[row["key"]] = " — ".join(parts) if parts else row["key"]
    return out


def path_label(e, path, row_titles):
    seg = path.split("/")
    if seg[:2] == ["data", "rows"] and len(seg) >= 4:
        return f"{field_title(e, seg[3])} — {row_titles.get(seg[2], seg[2])}"
    if seg[:2] in (["data", "fields"], ["data", "inputs"], ["data", "outputs"]) and len(seg) >= 4:
        return f"{field_title(e, seg[2])} › {LEAF_TITLES.get(seg[3], seg[3])}"
    if seg[:2] in (["data", "fields"], ["data", "inputs"], ["data", "outputs"]) and len(seg) == 3:
        return field_title(e, seg[2])
    if len(seg) == 2 and seg[0] == "data":
        return LEAF_TITLES.get(seg[1], seg[1])
    return LEAF_TITLES.get(path, path)


def path_labels_for(e, row_titles):
    rp = red_paths(e)
    paths = set(rp["unknown"]) | set(rp["disputed"]) | set(e["field_status"]) | {a["field"] for a in e["accounts"]}
    for rc in e["data"].get("reconciled_against", []):
        paths.add(f"data/rows/{rc['cell']['row']}/{rc['cell']['field']}")
    return {p: path_label(e, p, row_titles) for p in sorted(paths)}


entries_api = {}
for e in E:
    rt = row_titles_for(e)
    entries_api[e["id"]] = {
        "row_titles": rt,
        "path_labels": path_labels_for(e, rt),
        "entry": e,
        "confirmation": {v: confirmation_state(e, s) for v, s in VIEWERS.items()},
        "red_paths": red_paths(e),
        "consumers": consumers(e["id"]),
        "orphans": orphans(e),
        "blocker": blocker(e),
        "successor": e["superseded_by"], "predecessor": e["supersedes"],
        "resolved": resolved_for(e),
    }
dump(API / "entries.json", entries_api)

list_rows = [{"id": e["id"], "kind": e["kind"], "key": e["key"], "title": e["title"], "scope": e["scope"], "status": e["status"],
              "retired": e["retired"], "stub": bool(e["data"].get("stub")),
              "confirmation": {v: confirmation_state(e, s)["state"] for v, s in VIEWERS.items()},
              "red_counts": {k: len(v) for k, v in red_paths(e).items()}, "updated_at": e["updated_at"]} for e in E]
dump(API / "list.json", {"entries": list_rows, "coverage": {"read": 19, "total": 28, "label": "۱۹ از ۲۸ کاربرگ خوانده شده"}})

work = []
for e in E:
    if e["retired"] or e["data"].get("stub"):
        continue
    cs = confirmation_state(e, ["*"])
    orph = orphans(e)
    if cs["state"] in ("green",) and not orph:
        continue
    rp = red_paths(e)
    work.append({"id": e["id"], "kind": e["kind"], "title": e["title"], "scope": e["scope"], "state": cs["state"], "state_label": cs["label"],
                 "red_counts": {k: len(v) for k, v in rp.items()},
                 "count_label": " · ".join(s for s in [f"{len(rp['unknown'])} سلول بی‌پاسخ" if rp["unknown"] else "",
                                                       f"{len(rp['disputed'])} مورد متعارض" if rp["disputed"] else ""] if s),
                 "blocker": blocker(e), "orphans": orph, "universal": not e["scope"]["departments"]})
work.sort(key=lambda r: (not r["blocker"], r["state"] not in ("red_disputed", "red_unknown"), r["id"]))
dump(API / "worklist.json", {"rows": work, "coverage": {"read": 19, "total": 28, "label": "۱۹ از ۲۸ کاربرگ خوانده شده"}})

dump(API / "branches.json", [{"code": "chalebagh", "name": "چاله‌باغ"}, {"code": "naharkhoran", "name": "ناهارخوران"}])
dump(API / "coverage.json", {"read": 19, "total": 28, "label": "۱۹ از ۲۸ کاربرگ خوانده شده",
                              "unread": ["Anbar shobe 2", "FRIED🍤", "Kanter (ناهارخوران)", "Farangi (ناهارخوران)", "Logestic - Naharkhoran", "Salon - Naharkhoran", "Sandogh - NaharKhoran", "Ashpazkhne - Naharkhoran", "Gozaresh naharkhoran"]})
dump(API / "processes.json", PROCESSES)
dump(API / "confirmations.json", confirmations)

# ---------------------------------------------------------------------------
# README — coverage matrix
# ---------------------------------------------------------------------------
rows = []
for e in E:
    st = {v: confirmation_state(e, s)["state"] for v, s in VIEWERS.items()}
    rows.append(f"| {e['id']} | {e['kind']} | `{e['key']}` | {e['status']} | {st['editor_star']} | {st['cooking_editor']} | "
                f"{', '.join(o['class'] for o in orphans(e)) or '—'} | {'yes' if blocker(e) else '—'} |")

README = f"""# Mock facts data for the UI

Generated by `generate_mock.py` from the spec
(`docs/superpowers/specs/2026-08-29-quantitative-facts-design.md`). Re-run the
script after editing it. Everything is illustrative: ids, hashes and run
paths are fabricated; titles, keys and numbers follow the real estate.

- `store/` — the five fact files as `merge` writes them, plus `.index.json` and `manifest.json`.
- `api/entries.json` — id → `{{entry, confirmation, red_paths, consumers, orphans, blocker, resolved}}` (the detail screen).
  `confirmation` is given for two viewers: `editor_star` (confirm at `*`) and `cooking_editor` (confirm on `dept:cooking` only).
  `resolved` maps every id, item key and process id the entry points at — `{{ref}}` edges, `processes[]`, and the
  item keys inside `refItems` columns of a table (`prod_61`, `ing_1`, …) — to `{{kind, title, code?}}`.
  `row_titles` maps every row key to the row's Persian title (a reference table's row is composed from its
  refItems titles: `prod_61__ing_22` → «اینجا پیتزا — گوشت چرخ‌کرده»). `path_labels` maps every red path,
  account field and reconciled cell to a Persian label (`data/rows/prod_61__ing_41/grams` → «گرم — اینجا پیتزا — قارچ»).
  Rule inputs/outputs carry a Persian `title` beside their `key`. **Keys, ids, row keys and paths are never shown
  raw**: render titles, with the estate code (`##1`) beside an item where there is one; `expr` is the one place
  keys appear, as an LTR formula island.
- `api/labels.json` — the same map for everything in the store, for lists and search.
- `api/list.json` — the list screen rows + the coverage line.
- `api/worklist.json` — the gap worklist, blockers first, then red, then the rest; retired and stub entries excluded.
- `api/branches.json`, `api/coverage.json`, `api/processes.json`, `api/confirmations.json`.

Confirmation `state` values: `green` تأییدشده · `amber` تأییدنشده · `stale` تغییرکرده پس از تأیید ·
`red_disputed` متعارض · `red_unknown` بی‌پاسخ · `universal` نیازمند تأیید سراسری (only for a viewer without `*`) · `stub` پیش‌ثبت.

## Which entry shows which state

| id | kind | key | epistemic status | conf (`*`) | conf (cooking) | orphan classes | blocker |
|---|---|---|---|---|---|---|---|
{chr(10).join(rows)}

## Shapes covered

- **item**: coded (F-00001), product (F-00002), ranged pack factor (F-00003), uncoded `code_absent` (F-00004),
  `code_collision` issue pair (F-00005/06), `tracked: false` with reason (F-00007, F-00048), `place` items (F-00008/09),
  **retired** (F-00010), stale confirmation (F-00005, F-00053).
- **record**: paper log with `null` units → unknown (F-00011); paper form with sections / `when` / `open` row (F-00012);
  sheet log with `constraints` enum/min/max, `refItems`, `issues[]` scale (F-00013); **reference table** with rows, a `null` cell,
  a disputed cell (two accounts), a retired row and `reconciled_against` (F-00014); mirror (F-00015); report with `derived`,
  composite `foreignKeys` + `transform` (F-00016); `native` config = the unit table (F-00017); `external` POS with
  `identifier_scheme` (F-00018); `movement` + banded `fields[].group` (F-00019, F-00020); **record stub** (F-00021);
  **workbook stub** (F-00022); sales log (F-00047).
- **measurement**: with `writes_to` and a `process` source (F-00023); `inferred` method (F-00024); `informal` verbal report with
  no `writes_to` (F-00025).
- **rule**: constant with value (F-00026, F-00051), constant with `range` output + multi-source (F-00027), constant with
  `value: null` → unknown (F-00028, F-00035), `informal` constant (F-00029), computed `feel` with **disputed `expr`**
  (incumbent + challenger accounts) and a process link (F-00030), `sum over` aggregate + `calls` (F-00031), `table` hit
  first + default (F-00032, F-00050), `table` collect × product with `operator` input (F-00033), `text` policy with a null
  threshold (F-00034/35), `gs` with `port: true` + `edge_cases` (F-00036), drifted twin `template_of` + `divergence: drift`
  (F-00037), branch twin `divergence: none` (F-00038), multi-output with `share` and `informal` shares (F-00039), `sheets`
  with an `issues[].bug` and a **moved source** (F-00040), `via` + `calendar` input (F-00041), **supersession pair**
  (F-00042 closed → F-00043), rule whose cited **node is gone** (F-00044), constant that disagrees with the BOM (F-00046).
- **note**: F-00045, F-00052.
- **orphans**: tombstoned process with heir (F-00020), node gone (F-00044), moved source (F-00040).
- **scope**: universal (F-00001, F-00014, F-00017, F-00036 …), department only, department + branch, multi-branch twins.
- **source types**: sheet, script, comment, validation, cf, photo, pdf, docx, voice, process, chat — all present.
"""
(HERE / "README.md").write_text(README, encoding="utf-8")

# ---------------------------------------------------------------------------
# Self-check: every {{ref}} resolves, keys match the pattern, states covered
# ---------------------------------------------------------------------------
import re
KEY_RE = re.compile(r"^[a-z][a-z0-9]*(_[a-z0-9]+)*(__[a-z][a-z0-9]*(_[a-z0-9]+)*)*$")
problems = []
ids = set(BY_ID)


def walk(o, path):
    if isinstance(o, dict):
        if set(o) <= {"ref", "field", "row"} and "ref" in o and o["ref"].startswith("F-") and o["ref"] not in ids:
            problems.append(f"dangling ref {o['ref']} at {path}")
        for k, v in o.items():
            walk(v, f"{path}/{k}")
    elif isinstance(o, list):
        for i, v in enumerate(o):
            walk(v, f"{path}[{i}]")


for e in E:
    if not KEY_RE.match(e["key"]):
        problems.append(f"bad key {e['key']}")
    walk(e, e["id"])
states = {confirmation_state(e, s)["state"] for e in E for s in VIEWERS.values()}
for needed in ("green", "amber", "stale", "red_disputed", "red_unknown", "universal", "stub"):
    if needed not in states:
        problems.append(f"state not covered: {needed}")
print(f"{len(E)} entries; states: {sorted(states)}; problems: {problems or 'none'}")
