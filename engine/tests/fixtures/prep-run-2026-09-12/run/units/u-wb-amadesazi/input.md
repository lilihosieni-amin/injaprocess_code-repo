# u-wb-amadesazi

نوع: workbook — 10 نامزد تصمیم

## نامزدها

S-r-51db194ff5dd · «بازدهی خروجی 2(%)» · 1 variant · 3 bindings · params: p1
    p1 → 100
    (H:H/B:B)*#
S-r-c27932c46bfe · «بازدهی خروجی 1(%)» · 1 variant · 5 bindings · params: p1
    p1 → 100
    (G:G/B:B)*#
S-r-fd9e0e8a8bd9 · «بازدهی خروجی 3(%)» · 1 variant · 3 bindings · params: p1
    p1 → 100
    (I:I/B:B)*#
S-rec-2c141582db58 · «خروجی آماده سازی به انبار» · amadesazi__s3 (—)
    fields: c_a=تاریخ[number]، c_b=تعداد مینی برگر[number]، c_c=تعداد برگر[number]، c_d=تعداد لقمه (سینه)[number]، c_e=وزن لقمه (سینه)[number]، c_f=وزن پیتزا (سینه)[number]، c_g=وزن گریل[number]، c_h=وزن کنار شنیسل[number]، c_i=تعداد چیزا[number]، c_j=وزن چیزا[number]، c_k=وزن لقمه (فیله)[number]، c_l=تعداد لقمه (فیله)[number]، c_m=وزن کنار فیله[number]، c_n=وزن پیتزا (فیله)[number]، c_o=وزن فیله[number]، c_p=تعداد فیله[number]، c_q=وزن بال استاندارد[number]، c_r=تعداد بال استاندارد[number]، c_s=وزن بال غیر استاندارد[string]، c_t=تعداد بال غیر استاندارد[string]، c_u=وزن چرخی[number]، c_v=وزن رست بیف[string]
    header notes: b: برگر | d: سینه مرغ | k: فیله مرغ | q: بال مرغ | u: گوشت | w: گوشت پخته شده (وزن)
    row labels: —
S-rec-3d5d67801f5d · «بازدهی» · amadesazi__s7 (—)
    fields: c_a=تاریخ[number]، c_b=ورودی (کیلو)[number]، c_c=نوع گوشت[string]، c_d=تولید 1[string]، c_e=تولید 2[string]، c_f=تولید 3[string]، c_g=خروجی 1 (کیلو)[number]، c_h=خروجی 2 (کیلو)[number]، c_i=خروجی 3 (کیلو)[string]، c_j=بازدهی خروجی 1(%)[number]، c_k=بازدهی خروجی 2(%)[number]، c_l=بازدهی خروجی 3(%)[number]
    header notes: —
    row labels: —
S-rec-9f60dda7c289 · «خمیر» · amadesazi__s2 (—)
    fields: c_a=تاریخ[number]، c_b=آمریکایی[number]، c_c=ایتالیایی[number]، c_d=وزن چاله باغ[string]، c_e=وزن ناهارخوران[string]
    header notes: —
    row labels: —
S-rec-a680471323d6 · «نیازمندیها و مشکلات» · amadesazi__s6 (—)
    fields: c_a=تاریخ[number]، c_b=نیازمندیها و مشکلات[string]، c_c=توضیحات و راه حل ها[string]
    header notes: —
    row labels: —
S-rec-e3f80534814b · «ورودی آماده سازی از انبار» · amadesazi__s4 (—)
    fields: c_a=تاریخ[number]، c_b=مغز ران[number]، c_c=سردست[number]، c_d=قلوه گاه گوسفندی[number]، c_e=قلوه گاه گوساله[number]، c_f=خورده راسته[string]، c_g=سینه[number]، c_h=فیله[number]، c_i=بال[number]، c_j=گلدست چرخی[number]، c_k=گلدست رست بیف[number]
    header notes: b: برگر (وزن) | g: مرغ (وزن) | j: گوشت (وزن)
    row labels: —
S-rec-ef021443f7dc · «ضایعات» · amadesazi__s1 (—)
    fields: c_a=تاریخ[number]، c_b=سینه مرغ[number]، c_c=فیله مرغ[number]، c_d=بال مرغ[number]، c_e=گوشت[number]
    header notes: —
    row labels: —
S-rec-fedf9cc0dbe1 · «OFF اجرایی» · amadesazi__s5 (—)
    fields: c_a=تاریخ[number]، c_b=تعداد از نظر هدف[number]، c_c=تعداد نفر کسب شده[number]، c_d=توضیحات[string]
    header notes: —
    row labels: —

## زمینه

comment · ضایعات!E367 · 1.120 مربوط به ضایعات گوشت راسته و 0.273 مربوط به ضایعات رست بیف.
comment · ضایعات!E376 · مقدار ۰.۶۸۲ ضایعات و خونابه استیک و ۰.۹۰ ضایعات و خونابه گردن
comment · ضایعات!E374 · ضایعات راسته ۱.۸۴۵ و مابقی ضایعات ۰.۸۰۰ رست بیف/ مغزران
comment · ضایعات!E377 · ضایعات برگر ۱.۵۱۰ خرده راسته حاوی دمار و ضایعات بود.\nمابقی ضایعات رست بیف
comment · ضایعات!B367 · 1.770 وزن ضایعات کنارشنیسل پخته شده.
comment · ضایعات!E361 · 1.615 مربوط به ضایعات گوشت راسته و مابقی ضایعات گردن برای چرخی
comment · ورودی آماده سازی از انبار!F380 · با کسر دمار و ضایعات وزن استفاده شده ۱۵.۶۰۰
comment · ورودی آماده سازی از انبار!C380 · با کسر ضایعات وزن سردست استفاده شده ۱۴.۶۲۵
comment · ورودی آماده سازی از انبار!J371 · ورودی گردن 20.085 + خرده استیک 0.525
comment · ورودی آماده سازی از انبار!J378 · ۰.۲۶۵ گرم خرده راسته به گردن اضافه شد
note_tab · نیازمندیها و مشکلات! · تاریخ | نیازمندیها و مشکلات | توضیحات و راه حل ها
note_tab · نیازمندیها و مشکلات! · 45814.0 | یخچال سوخاری برفک می‌زند -یخچال کوکا آماده‌سازی برفک می‌زند -پارچ بلندر قسمت زیر تیغها شل شده نیاز به تعمییر دارد | خرطومی زیر ظرفشویی پارگی دارد-پرس وکیوم یه قسمتش خوب پرس نمیکنه-
note_tab · نیازمندیها و مشکلات! · 45821.0 | دستگاه پرس وکیوم دوباره نیاز به تعمییر دارد
note_tab · نیازمندیها و مشکلات! · 45821.0 | پارچ بلندر قسمت زیر تیغهاش شل شده نیاز به تعمیر دارد
note_tab · نیازمندیها و مشکلات! · 45823.0 | دو دستگاه یخچال کوکا خراب است

## جدول‌های مرتبط

—

## ورودی‌های قابل استفادهٔ مجدد

S-rec-ef021443f7dc · record · ضایعات
S-rec-9f60dda7c289 · record · خمیر
S-rec-2c141582db58 · record · خروجی آماده سازی به انبار
S-rec-e3f80534814b · record · ورودی آماده سازی از انبار
S-rec-fedf9cc0dbe1 · record · OFF اجرایی
S-rec-a680471323d6 · record · نیازمندیها و مشکلات
S-rec-3d5d67801f5d · record · بازدهی
F-00001 · record · units · واحدها

## گره‌های فرایند

preparation-026 · preparation-026-n016 · تطبیق ورودی و خروجی ثبت‌شده آماده‌سازی با ورودی و خروجی ثبت‌شده انبار
preparation-026 · preparation-026-n006 · قرار دادن ضایعات لیبل‌خورده در یخچال‌های اختصاصی انبار در آماده‌سازی
preparation-026 · preparation-026-n017 · ورود روزانه ورودی، خروجی و مقدار تولید به فایل اکسل عنکبوتی آماده‌سازی
preparation-003 · preparation-003-n014 · تکمیل کل اقلام لیست توسط انبار و رساندن آن‌ها به آماده‌سازی تا یک ربع به یازده
preparation-003 · preparation-003-n017 · آماده کردن فرم نیازها توسط انبار بر اساس نیازها و درخواست‌های آشپزخانه و تحویل آن به آماده‌سازی
preparation-004 · preparation-004-n002 · بالا آوردن اقلام تکمیل‌شده از انبار به محیط آماده‌سازی
preparation-004 · preparation-004-n003 · تحویل گوشت از انبار به آماده‌سازی در حدود ساعت ۱۰:۳۰ تا ۱۱
preparation-004 · preparation-004-n005 · کنترل کیفی اقلام رسیده از انبار توسط سرپرست آماده‌سازی پیش از تحویل‌گرفتن
preparation-005 · preparation-005-n008 · ثبت ورودی، خروجی و ضایعات روزانه لاین سبزیجات در دفتر
preparation-012 · preparation-012-n033 · پخت ضایعات کنار شینسل در آماده‌سازی یک روز در هفته
preparation-014 · preparation-014-n041 · تحویل مرغ چیزا از انبار به آماده‌سازی
preparation-017 · preparation-017-n004 · تحویل گرفتن پپرونی، ژامبون‌ها و استیک ورقه‌ای ژاپنی از انبار و آوردن به آماده‌سازی
preparation-017 · preparation-017-n021 · پر کردن فرم تبدیل ژامبون، پپرونی و بیکن با ثبت ورودی، خروجی و ضایعات
preparation-018 · preparation-018-n001 · تحویل گرفتن گوشت مغز ران از انبار در آماده‌سازی
preparation-018 · preparation-018-n003 · ثبت وزن گوشت در دفتر با عنوان ورودی آماده‌سازی
preparation-019 · preparation-019-n003 · ثبت وزن گوشت خام در دفتر آماده‌سازی به عنوان ورودی آماده‌سازی
preparation-020 · preparation-020-n002 · وزن‌گیری گوشت راسته خام و ثبت آن در دفتر به‌عنوان ورودی آماده‌سازی
preparation-021 · preparation-021-n002 · وزن‌گیری گوشت سردست خام و ثبت آن در دفتر به عنوان ورودی آماده‌سازی
preparation-026 · preparation-026-n002 · ثبت وزن ورودی در دفتر اختصاصی لاین با عنوان ورودی آماده‌سازی
preparation-030 · preparation-030-n002 · تحویل گوشت گرم روز از انبار به آماده‌سازی در حدود ساعت ۱۰:۳۰ تا ۱۱
preparation-030 · preparation-030-n006 · ثبت وزن گوشت در دفتر گوشت با عنوان ورودی آماده‌سازی
preparation-030 · preparation-030-n021 · تحویل گرفتن پپرونی، ژامبون‌ها و استیک ورقه‌ای ژاپنی از انبار و آوردن به آماده‌سازی
preparation-031 · preparation-031-n008 · خارج کردن مرغ‌ها از فریزر و رساندن آن‌ها به آماده‌سازی از شب قبل توسط انبار
preparation-001 · preparation-001-n001 · ورود پرسنل آماده‌سازی به رستوران بین ساعت ۹:۳۰ تا ۹:۴۵ صبح
preparation-001 · preparation-001-n002 · اعلام تأخیر به سرپرست آماده‌سازی از چند ساعت قبل
preparation-001 · preparation-001-n006 · نظارت سرپرست آماده‌سازی بر نظم ورود پرسنل از رأس ساعت ۱۰ صبح
preparation-001 · preparation-001-n007 · حضور آماده‌به‌کار پرسنل در محیط آماده‌سازی رأس ساعت ۱۰ صبح
preparation-004 · preparation-004-n007 · پیگیری قلم خراب توسط مسئول لاین با هماهنگی سرپرست آماده‌سازی
preparation-005 · preparation-005-n009 · تحویل روزانه دفتر آمار لاین سبزیجات به سرپرست آماده‌سازی
preparation-006 · preparation-006-n011 · پر کردن سینک آماده‌سازی از آب پس از کیپ کردن آن
preparation-006 · preparation-006-n025 · تحویل روزانه یادداشت‌های دفتر به سرپرست آماده‌سازی
preparation-011 · preparation-011-n003 · تعیین مجری پخت پاستا توسط سرپرست آماده‌سازی و بر اساس میزان مسئولیت روزانه پرسنل هر لاین
preparation-013 · preparation-013-n005 · شستن سینی‌های استیل مخصوص پخت مرغ در آماده‌سازی
preparation-013 · preparation-013-n023 · بردن مرغ‌های پخته‌شده به بخش آماده‌سازی در طبقه بالا
preparation-013 · preparation-013-n025 · انتقال سینی‌های پخت از آشپزخانه پایین به آماده‌سازی
preparation-013 · preparation-013-n039 · تحویل ظرف‌های مرغ پیتزای آماده به انبار
preparation-014 · preparation-014-n030 · آماده کردن خمیر و مواد سوخاری پانکو
preparation-014 · preparation-014-n032 · غلتاندن چیزاها در خمیر آماده‌شده
preparation-016 · preparation-016-n002 · اعلام کسری مواد اولیه لاین خمیر روی فرم درخواست انبار
preparation-016 · preparation-016-n007 · قرار دادن خمیر برای آماده شدن

# Expression card

An `expr` is FEEL, and FEEL here is a closed subset. Nothing else parses.

**Keywords** — the only bare words that need no declaration:
`if` `then` `else` `and` `or` `not` `min` `max` `sum` `abs` `round` `over` `of`

**Identifiers.** Every other bare word must be declared: the `key` of one of the
rule's own `inputs[]` or `outputs[]`, or the `key` of an entry named in
`calls[]`. An identifier declared nowhere fails validation. A parameter is an
ordinary input: `{"key": "tolerance_gr", "from": {"param": "tolerancePerFoodGr"}}`
declares `tolerance_gr`, and the expression reads it by that name.

**The one aggregate form.** `sum over <input key> of ( … )` — the input key
names a record, and the identifiers inside the parentheses are that record's
field keys. There is no other loop and no other aggregate.

**`key`, never `name`.** Every member of `inputs[]`, `outputs[]`, `fields[]`,
`rows[]`, `applies_to[]`, `instances[]` is addressed by `key`.

**Minted segments** match `^[a-z][a-z0-9]*(_[a-z0-9]+)*$` — lowercase ASCII
letters, digits, single underscores. `__` joins two segments into a key and is
never typed inside one. No Persian, no capital, no dash, and never a segment
transliterated from a Persian word you guessed at.

**Never call a library function.** `GET_ROW_BY_PERSIAN_DATE`, `FILTER_BY_DATE`,
`CONVERT_GR_TO_KG` and their kind are the sheet's plumbing. State the business
computation instead.

**Worked examples**

    masraf_elami = mojudi_avval_shab + daryaft_az_anbar - mojudi_akhar_shab
    enheraf = masraf_vaqei - masraf_elami
    enheraf_ba_tolerance = enheraf - tolerance_gr / 1000 * basis
    masraf_vaqei = sum over bom of (gram_per_portion * portions_sold)


# Shape card

قرارداد بستهٔ انبار، ساخته‌شده از همان طرحواره‌ای که خروجی این واحد
در برابر آن بررسی می‌شود. کلیدی که اینجا نیامده باشد پذیرفته
نمی‌شود؛ هیچ کلیدی ساخته نمی‌شود و مقداری بیرون از فهرست مجاز هم
رد می‌شود.
`*` یعنی کلید الزامی است؛ `key` یک کلید ضرب‌شده (`a_b__c_d`) و
`segment` یک بخش از آن (`a_b`) است.

## item — data (قلم)

* category: یکی از: ingredient | product | packaging | consumable | place | other
  code: string | null
  code_absent: boolean
  grade: string | null
  group: string | null
  pack:
      size: number | null
      unit: string | null
  state: یکی از: raw | cooked | frozen | prepared | null
  tracked[]:
      reason: string | null
    * record: {"ref": "S-…"} (+ field, row)
      value: boolean | null
* unit: string | null
  unit_raw: string | null
  units[]:
      factor_to_base: یکی از این شکل‌ها —
        - number | null
        -
            max: number
            min: number
    * pack_unit: string

## record — data (جدول یا فرم)

  approved_by: string | null
  blank_master: boolean
  cadence: یکی از: nightly | shift | daily | weekly | monthly | ad_hoc | null
  day_boundary: string | null
  divergence: یکی از: none | intentional | drift | unknown | null
  fields[]:
      columns: object
      constraints:
          enum[]: any
          maximum: number
          minimum: number
          readOnly: boolean
          required: boolean
      derived: {"ref": "S-…"} یا null
      description: string | null
      filled_by: string | null
      group:
          key: segment
          title: string
    * key: segment
      refItems:
        * namespace: string
          resolved_by: یکی از: code | title
      title: string | null
      type: یکی از: string | number | integer | boolean | date
      unit: string | null
      unit_raw: string | null
  filled_by: string | null
  grain: string | null
  header_fields[]:
      columns: object
      constraints:
          enum[]: any
          maximum: number
          minimum: number
          readOnly: boolean
          required: boolean
      derived: {"ref": "S-…"} یا null
      description: string | null
      filled_by: string | null
      group:
          key: segment
          title: string
    * key: segment
      refItems:
        * namespace: string
          resolved_by: یکی از: code | title
      title: string | null
      type: یکی از: string | number | integer | boolean | date
      unit: string | null
      unit_raw: string | null
  identifier_scheme: object
  instances[]:
      branch: string یا null
      hidden: boolean
      imports[]:
        * key: key
          named_range: string | null
          range: string | null
        * source: یکی از این شکل‌ها —
            - {"ref": "S-…"} (+ field, row)
            -
              * sheet: string
              * spreadsheetId: string
    * key: key
    * sheet: string
      sheetId: integer | string | null
    * spreadsheetId: string
* location: object
* medium: یکی از: sheet | paper | external | native
  movement:
      from: {"ref": "S-…"} (+ field, row)
      reason: string | null
      to: {"ref": "S-…"} (+ field, row)
  original: string | null
  primaryKey[]: segment
  reconciled_against[]:
    * against: {"ref": "S-…"} (+ field, row)
    * cell: {field, row}
* role: یکی از: log | reference | report | config
  rows[]:
      key: key
      open: boolean
      retired: boolean
      section: segment
      supersedes: {"ref": "S-…"} یا null
      title: string | null
      unit: string | null
      unit_raw: string | null
      valid_to: 1405-05-26 یا null
      when: string | null
  sections[]:
    * key: segment
      title: string | null
  signatures[]:
    * role: string
      row_range: string | null
  stub: boolean
  template_of: {"ref": "S-…"} (+ field, row)

`location` بر حسب `medium`:
  medium=sheet: hidden، path، sheet، sheetId، spreadsheetId
  medium=paper: holder*، kept_at*
  medium=external: identifier_scheme، kept_at*، system*
  medium=native: identifier_scheme، kept_at

ستونی که خانه‌هایش نام هستند `type: string` است؛ `refItems` فقط برای خانه‌هایی است که کد `##` فهرست اقلام یا کلید یک قلم را دارند.

## measurement — data (اندازه‌گیری)

  by: string | null
  exceptions: string | null
  method: string | null
  of: {"ref": "S-…"} (+ field, row)
* quantity: یکی از: mass | count | volume | duration | money | ratio | other
* unit: string | null
  when: string | null
  writes_to: {"ref": "S-…"} (+ field, row)

## rule — data (قاعده)

  applies_to[]:
    * key: key
      params: object
      range: string | null
    * record: {"ref": "S-…"} (+ field, row)
      rows[]:
          item: string | null
        * key: key
          label: string | null
          row: integer | null
      variant: integer | string | null
  calls[]: {"ref": "S-…"} (+ field, row)
  divergence: یکی از: none | intentional | drift | unknown | null
  edge_cases[]:
      expected: any
      input: any
      why: string | null
  expr: string | null
  identifier: string | null
* inputs[]:
      from: یکی از این شکل‌ها —
        - {"ref": "S-…"} (+ field, row)
        -
          * param: string
        - یکی از: operator | calendar
        - null
    * key: segment
      title: string | null
      unit: string | null
      via: {"ref": "S-…"} (+ field, row)
  lang: یکی از: feel | table | text | sheets | gs | null
  original: string | null
* outputs[]:
    * key: segment
      nature: یکی از: standard | target | observed | limit | null
      of: {"ref": "S-…"} (+ field, row)
      per: string | null
      range:
          max: number | null
          min: number | null
      share: number | null
      title: string | null
      unit: string | null
      value: any
      writes_to: {"ref": "S-…"} (+ field, row)
  table:
      aggregate: یکی از: sum | product | min | max | null
      default: object
      hit: یکی از: first | unique | collect | null
    * inputs[]: segment
    * outputs[]: segment
    * rows[]: object
  template_of: {"ref": "S-…"} (+ field, row)
  text: string | null

`per` در خروجی یک قاعده کلید یک قلم است، نه یک نام. چهار شکل قاعده پذیرفته می‌شود: فرمول — `lang: feel` با `expr` و `inputs[]`؛ عدد ثابت — `inputs: []`، بدون `expr`، و هر خروجی با `value` یا `range`؛ سیاست بی‌فرمول — `lang: text`، `inputs[]` را نام ببر، `expr` خالی، و جملهٔ اصلی را در `original` بنویس؛ جدول تصمیم — `lang: table`، `expr` خالی، و `table` با `inputs`/`outputs` (کلیدهای همان ورودی و خروجی‌ها) و `rows[]` که هر سطر یک شیء تخت است با همان کلیدها. `nature: standard` یعنی عدد ثابت و `value` یا `range` می‌خواهد.

## note — data (یادداشت)

* about[]: {"ref": "S-…"} (+ field, row)
* question: string

## نام‌های فنی در متن نمی‌آیند

نام جدول‌ها (هر نامی که با `Table_` شروع می‌شود) و نام فایل‌ها (`.xlsx`، `.gs`) و متن فرمول‌ها در هیچ `title` یا `statement` یا `description` نمی‌آیند؛ جای آن‌ها `source[]` است.

## نمونه‌های کامل `new[]`

```json
{
  "kind": "record",
  "key": "form_tahvil_anbar",
  "title": "فرم تحویل کالا از انبار",
  "statement": "فرم کاغذی که هنگام تحویل هر قلم از انبار به لاین پر می‌شود و مقدار تحویلی و تحویل‌گیرنده را ثبت می‌کند.",
  "data": {
    "medium": "paper",
    "role": "log",
    "location": {
      "kept_at": "دفتر انبار",
      "holder": "سرپرست انبار"
    },
    "cadence": "daily",
    "grain": "هر تحویل",
    "filled_by": "انباردار",
    "approved_by": "سرپرست آشپزخانه",
    "blank_master": true,
    "fields": [
      {
        "key": "tarikh",
        "title": "تاریخ",
        "type": "date"
      },
      {
        "key": "qalam",
        "title": "نام کالا",
        "type": "string",
        "refItems": {
          "namespace": "##",
          "resolved_by": "title"
        }
      },
      {
        "key": "meqdar",
        "title": "مقدار",
        "type": "number",
        "unit": "kg"
      },
      {
        "key": "tahvil_girande",
        "title": "تحویل‌گیرنده",
        "type": "string"
      }
    ],
    "signatures": [
      {
        "role": "انباردار"
      },
      {
        "role": "سرپرست آشپزخانه"
      }
    ],
    "primaryKey": [
      "tarikh",
      "qalam"
    ]
  }
}
```

```json
{
  "kind": "measurement",
  "key": "vazn_morgh_vorudi",
  "title": "وزن مرغ ورودی",
  "statement": "وزن هر محموله مرغ هنگام تحویل با ترازوی انبار اندازه گرفته می‌شود و در فرم تحویل ثبت می‌شود.",
  "data": {
    "quantity": "mass",
    "unit": "kg",
    "method": "ترازوی دیجیتال انبار",
    "when": "هنگام تحویل محموله",
    "by": "انباردار",
    "exceptions": "محموله‌های بسته‌بندی‌شده با وزن چاپی دوباره وزن نمی‌شوند."
  }
}
```

```json
{
  "kind": "rule",
  "key": "enheraf_ba_tolerance",
  "title": "انحراف مصرف با تلورانس",
  "statement": "انحراف مصرف هر ماده اولیه پس از کسر تلورانس مجاز به دست می‌آید؛ مقدار مثبت یعنی مصرف بیش از انتظار بوده است.",
  "data": {
    "lang": "feel",
    "expr": "enheraf_ba_tolerance = enheraf - tolerance_gr / 1000 * basis",
    "inputs": [
      {
        "key": "enheraf",
        "title": "انحراف مصرف",
        "unit": "kg"
      },
      {
        "key": "tolerance_gr",
        "title": "تلورانس",
        "unit": "g",
        "from": {
          "param": "tolerancePerFoodGr"
        }
      },
      {
        "key": "basis",
        "title": "مبنای تلورانس",
        "from": {
          "param": "ref_1"
        }
      }
    ],
    "outputs": [
      {
        "key": "enheraf_ba_tolerance",
        "title": "انحراف با تلورانس",
        "unit": "kg",
        "nature": "observed"
      }
    ]
  }
}
```

```json
{
  "kind": "rule",
  "key": "mabnaye_sabt_mande",
  "title": "مبنای ثبت ماندهٔ پایان شب",
  "statement": "مبنای ثبت ماندهٔ پایان شب برای هر گروه از اقلام متفاوت است: گروهی با وزن و گروهی با تعداد ثبت می‌شوند.",
  "data": {
    "lang": "table",
    "expr": null,
    "inputs": [
      {
        "key": "goruh_qalam",
        "title": "گروه قلم"
      }
    ],
    "outputs": [
      {
        "key": "mabnaye_sabt",
        "title": "مبنای ثبت مانده"
      }
    ],
    "table": {
      "inputs": [
        "goruh_qalam"
      ],
      "outputs": [
        "mabnaye_sabt"
      ],
      "rows": [
        {
          "goruh_qalam": "بیکن ورقه‌ای",
          "mabnaye_sabt": "فقط وزن"
        },
        {
          "goruh_qalam": "نوشیدنی‌های کانتر",
          "mabnaye_sabt": "تعداد"
        }
      ]
    }
  }
}
```

## واحدهای مجاز

`unit` یکی از این نمادهاست؛ نماد دیگری تنها در صورتی پذیرفته می‌شود که همین سند آن را به صورت یک سطر تازه به رکورد واحدها (کلید `units`) اضافه کند، وگرنه رد می‌شود:
`carton`، `day`، `g`، `hour`، `irr`، `kg`، `l`، `min`، `ml`، `pack`، `pcs`، `percent`، `portion`، `ratio`، `slice`

# Style card

**`title`** — a noun phrase naming the concept. At most 60 characters, Persian,
no file, tab or cell name, no Latin except an item code.

**`statement`** — one to three sentences in the register of a written
procedure: what is measured or computed, in what unit, by whom, when; for a
record, what it is and who fills it; for an item, what it is and how it is
counted.

Never, in either field:

- an A1 address (`H6`, `$J$15`, `'پیتزا'!M6:M15`), a column letter, a tab, file
  or `Table_*` name;
- formula text, a function name, `IMPORT_FROM_SHEET`, `LET(`, `LAMBDA`,
  `.xlsx`, `.gs`;
- a schema field name, or this pipeline's vocabulary: «پاس», «اسکلت»,
  «بخش از داده‌ها», «واحد کاری», «بچ», «original», «bindings», «FEEL»,
  «account», «expr»;
- a Latin token of four letters or more — `csv`, `Excel`, `sheet`, a unit
  symbol and an item code are the only exceptions;
- a quotation, «گفته شد», «گوینده»;
- the colloquial endings «می‌زنن», «می‌کنن», «داشته باشن», «بگیم», «می‌گیم»;
- a «…» span longer than eight words.

«ستون», «تب» and «سلول» are allowed in exactly two places: a record's own
`statement`, and a field's `description`.

**Worked pair**

before — «ستون J تب پیتزا (گروه J6:J15): انحراف برابر است با مصرف واقعی منهای
مصرف اعلامی.»

after — «انحراف مصرف هر مادهٔ اولیه در پایان شب برابر است با مصرف واقعی
(برآوردشده از فروش و نسخهٔ غذاها) منهای مصرف اعلامی لاین. مقدار منفی یعنی لاین
بیش از انتظار مصرف کرده است.»

A quote belongs in `source[].quote`, a locator in `source[]`, a rival reading in
`accounts[].statement` — never in a title or a statement.
