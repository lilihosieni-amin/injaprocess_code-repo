/**
 * Every Persian word the facts section shows, in one file (QF-42, spec
 * Appendix D).
 *
 * **The stored value is the English key on the left**, and nothing decides
 * anything from what is on the right: labels are presentation, the store stays
 * English (QF-32), and a label may be changed at any time without touching a
 * single `.json` file. Where the estate's own staff have a word for a thing,
 * that word is used — «آیتم», «مانده شب», «تلورانس» — so the reviewer reads the
 * vocabulary of the meetings rather than a translation of a schema.
 *
 * The maps are per enumeration rather than one flat dictionary because the same
 * English word means two things in two places: `confirmed` is a field's
 * epistemic status *and* an entry's confirmation state, `chat` is a source type
 * *and* a run origin, `sheet` is a medium *and* a source type. A caller names
 * the map it is rendering from, so those never collide.
 *
 * Shape follows `lib/roles.ts` — a map plus an accessor — per §14 conformance
 * note 9, which deletes the design's twelve inline `F*` dictionaries
 * (`Inja Panel.dc.html:3304–3318`) and its seven `*_FA` ones (4680–4735) in
 * favour of this file and the registries: departments from the department
 * registry, branches from `GET /api/facts/branches`, units from the entry's own
 * served `unit_title`.
 *
 * `factsLabels.test.ts` reads the five schemas that mention a fact and asserts
 * every `enum` member and `const` in them has a label here. **A value added to
 * one of those enumerations without a label fails the build** rather than
 * leaking an English word onto a Persian screen.
 *
 * **Know how far that reaches.** The walk finds 118 members across the five
 * files, which are 37 distinct values — the five
 * kinds, the five statuses, the two `field_status` values, the eleven source
 * types, the three account statuses, the seven issue kinds, the four fix ops
 * and the three run origins. It does **not** cover the payload enumerations —
 * `category`, `state`, `medium`, `role`, `cadence`, `fields[].type`,
 * `quantity`, `nature`, `lang`, `hit`, `aggregate`, `divergence` — because
 * `facts.schema.json` types `data` as an unconstrained object (`:104`) and
 * freezing a key set there would freeze the store. Those maps are transcribed
 * from Appendix D and §7 and are guarded by review, not by the test.
 */

/** The five kinds (§7). */
export const KIND_LABELS: Record<string, string> = {
  item: 'آیتم',
  record: 'جدول',
  measurement: 'اندازه‌گیری',
  rule: 'قاعده',
  note: 'یادداشت',
}

/** `record.role` — what the table is for (§7). */
export const ROLE_LABELS_RECORD: Record<string, string> = {
  log: 'جدول ثبت',
  reference: 'جدول مرجع',
  mirror: 'نسخهٔ پیوندی',
  report: 'گزارش',
  config: 'تنظیمات',
}

/** `rule.lang` — how the computation is written (§7). */
export const LANG_LABELS: Record<string, string> = {
  feel: 'فرمول',
  table: 'جدول تصمیم',
  text: 'ضابطه',
  sheets: 'فرمول شیت',
  gs: 'اسکریپت',
}

/**
 * Appendix D's third column — "shown as, by shape": what the header chip says
 * *beside* the kind. A `record` is named by its `role`, a `rule` by its `lang`,
 * and a rule with no inputs is «مقدار ثابت» whatever its `lang` says.
 *
 * Composed from the two maps above rather than restated, so each Persian string
 * has one definition. `constant` is the one member neither of them carries; it
 * is a *shape*, not a stored enumeration value — a rule whose `inputs` is empty
 * (`Inja Panel.dc.html:4814`).
 */
export const KIND_SHAPE_LABELS: Record<string, string> = {
  ...ROLE_LABELS_RECORD,
  ...LANG_LABELS,
  constant: 'مقدار ثابت',
}

/**
 * The epistemic status of a field — **distinct from the confirmation tick**
 * (QF-6). A `null` leaf is بی‌پاسخ, an open account is متعارض, a `field_status`
 * line is استنباطی or عرفی, anything else is صریح.
 *
 * The same five values are `envelope.status` for the entry as a whole.
 */
export const FIELD_STATUS_LABELS: Record<string, string> = {
  confirmed: 'صریح',
  inferred: 'استنباطی',
  informal: 'عرفی',
  disputed: 'متعارض',
  unknown: 'بی‌پاسخ',
}

/**
 * The confirmation state of an entry (QF-25) — **two values, as for a
 * flowchart**, and the two are not distinguished on screen: a mark whose
 * fingerprint no longer matches reads exactly like an entry never ticked.
 *
 * The keys are the two states of the served `confirmation.confirmed` boolean,
 * not a stored enumeration: no `confirmed` flag is ever written to a fact
 * (QF-6), and the client never computes a fingerprint (QF-24).
 */
export const CONFIRMATION_LABELS: Record<string, string> = {
  confirmed: 'تأییدشده',
  unconfirmed: 'تأییدنشده',
}

/**
 * Badges, counts and the disabled tick — **properties of the entry, shown
 * beside the chip, never inside it** (QF-25, conformance note 1).
 *
 * `{n}` is substituted by the caller. A universal entry the reviewer cannot
 * tick has no control and no label at all, so there is nothing here for it.
 */
export const BADGE_LABELS: Record<string, string> = {
  stub: 'پیش‌ثبت',
  retired: 'بازنشسته',
  unknown_count: '{n} بی‌پاسخ',
  disputed_count: '{n} متعارض',
  cannot_confirm: 'قابل تأیید نیست',
}

/** `item.category`. */
export const CATEGORY_LABELS: Record<string, string> = {
  ingredient: 'مادهٔ اولیه',
  product: 'محصول',
  packaging: 'بسته‌بندی',
  consumable: 'مصرفی',
  place: 'محل نگهداری',
  other: 'سایر',
}

/** `item.state`. */
export const STATE_LABELS: Record<string, string> = {
  raw: 'خام',
  cooked: 'پخته',
  frozen: 'منجمد',
  prepared: 'آماده‌شده',
}

/** `record.medium` — what the table physically is. */
export const MEDIUM_LABELS: Record<string, string> = {
  sheet: 'کاربرگ',
  paper: 'فرم کاغذی',
  external: 'سامانهٔ بیرونی',
  native: 'داخلی',
}

/** `record.cadence`. */
export const CADENCE_LABELS: Record<string, string> = {
  nightly: 'هر شب',
  shift: 'هر شیفت',
  daily: 'روزانه',
  weekly: 'هفتگی',
  monthly: 'ماهانه',
  ad_hoc: 'موردی',
}

/** `fields[].type`. */
export const FIELD_TYPE_LABELS: Record<string, string> = {
  string: 'متن',
  number: 'عدد',
  integer: 'عدد صحیح',
  boolean: 'بله/خیر',
  date: 'تاریخ',
}

/** `measurement.quantity`. */
export const QUANTITY_LABELS: Record<string, string> = {
  mass: 'وزن',
  count: 'تعداد',
  volume: 'حجم',
  duration: 'مدت',
  money: 'مبلغ',
  ratio: 'نسبت',
  other: 'سایر',
}

/**
 * `outputs[].nature` — what kind of number this is.
 *
 * The design carries this twice and disagrees with itself: `FNATURE` (3310) has
 * «استاندارد» / «مشاهده‌شده» and `NATURE_FA` (4693) has the fuller wording
 * below, which is Appendix D's and which the design itself prefers at render
 * time (4837).
 */
export const NATURE_LABELS: Record<string, string> = {
  standard: 'استاندارد تعیین‌شده',
  target: 'هدف',
  observed: 'مشاهده‌شده در عمل',
  limit: 'حد مجاز',
}

/** `table.hit` — which matching row wins. */
export const HIT_LABELS: Record<string, string> = {
  first: 'اولین سطر',
  unique: 'تنها سطر',
  collect: 'همهٔ سطرها',
}

/** `table.aggregate` — how `collect`'s rows are folded. */
export const AGGREGATE_LABELS: Record<string, string> = {
  sum: 'جمع',
  product: 'حاصل‌ضرب',
  min: 'کمینه',
  max: 'بیشینه',
}

/** `rule.divergence` — how far this rule has drifted from its template. */
export const DIVERGENCE_LABELS: Record<string, string> = {
  none: 'یکسان با الگو',
  intentional: 'تفاوت عمدی',
  drift: 'انحراف از الگو',
  unknown: 'نامشخص',
}

/** `accounts[].status`. An `open` account is what makes a field متعارض. */
export const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  open: 'باز',
  chosen: 'انتخاب‌شده',
  rejected: 'ردشده',
}

/** `issues[].kind`. */
export const ISSUE_KIND_LABELS: Record<string, string> = {
  scale: 'تغییر مقیاس',
  unit_kind: 'تغییر نوع واحد',
  column_shift: 'جابه‌جایی ستون',
  junk: 'دادهٔ نامعتبر',
  bug: 'خطای فرمول یا اسکریپت',
  cross_record: 'ناسازگاری بین دو جدول',
  code_collision: 'تداخل کد',
}

/** `issues[].fix.op` — the repair the issue proposes. */
export const FIX_OP_LABELS: Record<string, string> = {
  multiply: 'ضرب در',
  divide: 'تقسیم بر',
  shift_columns: 'جابه‌جایی ستون‌ها',
  ignore: 'نادیده گرفتن',
}

/**
 * `source[].type` — where the statement was read from.
 *
 * «جلسه» is the transcript, not the audio: audio is not kept (the meetings
 * directory is purged), and the transcript is the record of source. «PDF» and
 * «سند Word» are the estate's own words for those two file types.
 */
export const SOURCE_TYPE_LABELS: Record<string, string> = {
  sheet: 'کاربرگ',
  script: 'اسکریپت',
  comment: 'یادداشت سلول',
  validation: 'اعتبارسنجی',
  cf: 'قالب‌بندی شرطی',
  photo: 'عکس',
  pdf: 'PDF',
  docx: 'سند Word',
  voice: 'جلسه',
  process: 'فرایند',
  chat: 'گفتگو',
}

/** The two `inputs[].from` string literals — everything else there is a `{ref}`. */
export const FROM_LITERAL_LABELS: Record<string, string> = {
  operator: 'انتخاب اپراتور',
  calendar: 'تقویم',
}

/** `meta.origin` — which of the three roads wrote this run. */
export const ORIGIN_LABELS: Record<string, string> = {
  pipeline: 'اجرای خودکار',
  chat: 'گفتگو',
  ui: 'پنل',
}

/** The envelope's own field names (§6). */
export const ENVELOPE_FIELD_LABELS: Record<string, string> = {
  id: 'شناسه',
  key: 'کلید',
  title: 'عنوان',
  aliases: 'نام‌های دیگر',
  statement: 'بیان',
  scope: 'دامنه',
  departments: 'دپارتمان‌ها',
  branches: 'شعبه‌ها',
  source: 'منابع',
  status: 'وضعیت',
  field_status: 'وضعیت فیلدها',
  accounts: 'روایت‌ها',
  speaker_role: 'گوینده (نقش)',
  valid_from: 'معتبر از',
  valid_to: 'معتبر تا',
  supersedes: 'جایگزینِ',
  superseded_by: 'جایگزین‌شده با',
  retired: 'بازنشسته',
  issues: 'نقص‌ها',
  processes: 'فرایندهای مرتبط',
  updated_at: 'آخرین تغییر',
}

/**
 * The payload's field names, across all five kinds (§7).
 *
 * **Four names mean two things and therefore have two keys**, because one flat
 * map cannot hold both — each pair is written out here so a later reader does
 * not "fix" one of them back into a collision:
 *
 * * `from` is a rule input's «خوانده می‌شود از»; `movement_from` is a record
 *   movement's «از» (and `movement_to` / `movement_reason` beside it).
 * * `when` is a measurement's «زمان»; `row_when` is a printed form row's
 *   «فقط در».
 * * `writes_to` is a measurement's «ثبت در»; `writes_to_output` is a rule
 *   output's «نوشته می‌شود در».
 * * `tracked_value` / `tracked_record` / `tracked_reason` are the members of an
 *   item's `tracked`, whose `value` and `record` would otherwise collide with
 *   the top-level `value` and with the `record` kind.
 */
export const PAYLOAD_FIELD_LABELS: Record<string, string> = {
  // `fields[].title` / `key` — the same two words `ENVELOPE_FIELD_LABELS`
  // carries for the entry itself, and needed on both maps because a caller
  // renders a column's field names from this one and `label()` throws in dev
  // on a key that is not on the map it was handed.
  title: 'عنوان',
  key: 'کلید',
  inputs: 'ورودی‌ها',
  outputs: 'خروجی‌ها',
  expr: 'فرمول',
  value: 'مقدار',
  range: 'بازه',
  min: 'کمینه',
  max: 'بیشینه',
  unit: 'واحد',
  unit_raw: 'واحد به نوشتهٔ منبع',
  per: 'به ازای هر',
  of: 'برای',
  writes_to: 'ثبت در',
  writes_to_output: 'نوشته می‌شود در',
  from: 'خوانده می‌شود از',
  via: 'با تبدیل واحد',
  share: 'سهم',
  calls: 'فراخوانی‌ها',
  identifier: 'نام تابع',
  original: 'متن اصلی',
  original_ref: 'متن اصلی',
  port: 'باید عیناً در ERP پیاده شود',
  edge_cases: 'موارد خاص',
  input: 'ورودی',
  expected: 'خروجی مورد انتظار',
  why: 'چرا',
  template_of: 'الگو',
  divergence: 'تفاوت با الگو',
  fields: 'ستون‌ها',
  header_fields: 'فیلدهای سربرگ',
  rows: 'ردیف‌ها',
  sections: 'بخش‌ها',
  signatures: 'امضاها',
  type: 'نوع',
  constraints: 'محدودیت‌ها',
  derived: 'محاسبه‌شده با',
  group: 'گروه',
  filled_by: 'تکمیل‌کننده',
  refItems: 'ارجاع به آیتم',
  enum: 'مقادیر مجاز',
  readOnly: 'فقط‌خواندنی',
  required: 'اجباری',
  minimum: 'کمینه',
  maximum: 'بیشینه',
  section: 'بخش',
  row_when: 'فقط در',
  open: 'ردیف باز',
  doc_number_field: 'فیلد شمارهٔ سند',
  signature_role: 'نقش امضاکننده',
  row_range: 'ردیف‌ها',
  primaryKey: 'کلید اصلی',
  foreignKeys: 'ارتباط با جدول دیگر',
  reference_fields: 'ستون‌های مقابل',
  transform: 'تبدیل',
  location: 'محل',
  path: 'مسیر',
  spreadsheetId: 'شناسهٔ فایل',
  sheet: 'برگه',
  sheetId: 'شمارهٔ برگه',
  hidden: 'مخفی',
  identifier_scheme: 'شیوهٔ شناسه',
  blank_master: 'برگهٔ خالی برای پر کردن',
  grain: 'هر ردیف یعنی',
  cadence: 'تناوب',
  day_boundary: 'مرز روز کاری',
  approved_by: 'تأییدکنندهٔ فرم',
  mirror_of: 'نسخه‌ای از',
  reconciled_against: 'تطبیق با مقدار ثابت',
  cell: 'سلول',
  against: 'مقدار ثابت',
  movement: 'انتقال',
  movement_from: 'از',
  movement_to: 'به',
  movement_reason: 'دلیل',
  method: 'روش',
  when: 'زمان',
  by: 'توسط',
  exceptions: 'استثناها',
  code: 'کد',
  code_absent: 'بدون کد',
  category: 'دسته',
  state: 'حالت',
  grade: 'درجه',
  pack: 'بسته',
  size: 'تعداد',
  units: 'واحدهای بسته‌بندی',
  pack_unit: 'واحد بسته',
  factor_to_base: 'ضریب تبدیل به واحد پایه',
  tracked: 'ردیابی',
  tracked_record: 'در جدول',
  tracked_value: 'می‌شود/نمی‌شود',
  tracked_reason: 'دلیل',
  stub: 'پیش‌ثبت',
}

/**
 * Screens, row classes, actions and the section headings the design draws.
 *
 * `{n}`, `{m}`, `{heir}` and `{kind}` are substituted by the caller.
 *
 * Three members here have **no drawn home in the design** and are transcribed
 * because Appendix D declares them, not because anything renders them yet:
 * `coverage` (the design computes `factsCoverage` and consumes it nowhere),
 * `raw_view`, and — through `PAYLOAD_FIELD_LABELS.original` — the «متن اصلی»
 * block. They are consult items in
 * `docs/superpowers/plans/facts-design-audit.md` §6, and nothing is built for
 * them until the owner says where they go.
 */
export const SCREEN_LABELS: Record<string, string> = {
  // the section itself
  section: 'داده‌های کمّی',
  coverage: '{n} از {m} کاربرگ خوانده شده',

  // orphan classes — every one of them, per conformance note 7
  orphan_reference: 'ارجاع بی‌مقصد',
  moved_source: 'منبع تغییرکرده',
  tombstoned_process: 'اشاره به فرایند بازنشسته (جایگزین: {heir})',
  missing_node: 'گرهٔ ارجاع‌شده حذف شده',

  // actions
  confirm: 'تأیید این مورد',
  revoke: 'برداشتن تأیید',
  choose_account: 'انتخاب این روایت',
  download_ask: 'فایل منبع دانلود شود؟',
  download: 'دانلود',
  cancel: 'انصراف',
  consumers: 'استفاده‌کنندگان',
  raw_view: 'نمای خام (فقط‌خواندنی)',
  // What a `{ restricted: true }` neighbour renders instead of a name — the
  // owner's ruling of 2026-08-31, *keep the row, hide the name*.
  // `routers/facts.py:345` states that this string is the UI's and comes from
  // this file; it is in Appendix D under *Screens, row classes and actions*.
  restricted_neighbour: 'خارج از دسترسی شما',

  // the four filters, in the design's own order (Inja Panel.dc.html:4640)
  filter_kind: 'نوع',
  filter_scope: 'دپارتمان',
  filter_branch: 'شعبه',
  filter_confirmation: 'وضعیت تأیید',
  // …and the «سراسری» option the «دپارتمان» menu carries beside the department
  // codes (:4639). It is not a department: it asks for the entries that name
  // none, which is `factsFilter.UNIVERSAL`.
  filter_scope_universal: 'سراسری',

  // the list screen (:1004–1069). The five column heads are written out rather
  // than borrowed from `filter_kind` / `filter_scope` and `ENVELOPE_FIELD_LABELS`:
  // the head «وضعیت» is the confirmation chip's column and `envelope.status` is
  // the entry's epistemic status (QF-6), which is a different fact in the same
  // word — exactly the collision this file's per-map shape exists to prevent.
  column_title: 'عنوان',
  column_id: 'شناسه',
  column_kind: 'نوع',
  column_scope: 'دپارتمان',
  column_confirmation: 'وضعیت',
  // What an entry bound to no department and no branch says in the scope cell
  // (`scopeLine`, :4634) — the whole installation, not a blank.
  scope_universal: 'کل سامانه',
  // The search field. Two strings because F11 binds a NAME to the input and the
  // design draws only a placeholder, which vanishes on focus and is announced to
  // nobody; `ProcessList` and `UsersFilters` carry the same pair.
  search_label: 'جست‌وجوی عنوان داده',
  search_placeholder: 'جست‌وجوی عنوان داده…',
  clear_filters: 'پاک کردن همهٔ فیلترها',
  empty_filtered: 'با این فیلترها داده‌ای نیست',
  // The screen's own load failure — not the design's (it draws no failure
  // state), but the app's, in the shape `LoadFailedScreen` takes everywhere.
  load_failed: 'فهرست داده‌های کمّی بارگذاری نشد.',

  // the confirm dialog
  confirm_dialog_title: 'کل این داده تأیید شود؟',
  confirm_dialog_body: 'اثر انگشت از کل داده گرفته می‌شود؛ هر تغییر بعدی تأیید را باطل می‌کند.',

  // section headings, from the design
  heading_statement: 'بیان',
  heading_inputs: 'چه چیزهایی لازم دارد',
  heading_inputs_hint: 'عددهایی که این قاعده از جای دیگر می‌خواند',
  heading_outputs: 'چه چیزی می‌سازد',
  heading_outputs_hint: 'نتیجهٔ این قاعده و جایی که نوشته می‌شود',
  heading_decision_table: 'جدول تصمیم',
  table_default: 'در غیر این صورت',
  heading_lifecycle: 'اعتبار زمانی',
  valid_to_closed: 'بسته‌شده',
  heading_record_structure: 'ساختار و مکان جدول',
  heading_printed_rows: 'قلم‌های چاپ‌شده روی فرم',
  printed_row_retired: 'دیگر استفاده نمی‌شود',
  printed_row_open: 'ردیف خالی',
  unit_missing: 'واحد ثبت نشده',
  heading_item_packs: 'واحدهای بسته‌بندی',
  item_base_unit: 'واحد پایه',
  heading_edge_cases: 'موارد خاص',
  heading_accounts: 'روایت‌های متعارض',
  issue_prefix: 'نقص: {kind}',
  heading_sources: 'منابع',
  heading_processes: 'فرایندهای مرتبط',

  // ── The detail screen's own copy (Task 23).
  //
  // **Every string below is the design's own, transcribed verbatim from the
  // facts-detail markup with its line beside it.** Appendix D names the labels
  // an enumeration or a field needs; it does not carry the sentences and the
  // count phrases the detail screen draws around them, and conformance note 9
  // forbids a component holding a Persian literal. So the words move here
  // unchanged — this block invents no copy, it only gives the design's copy the
  // one home the note requires. `{n}` / `{m}` are substituted by the caller.
  //
  // Design lines are `ui/design/Inja Panel.dc.html`.
  row_count: '{n} ردیف',                                   // :1345
  row_count_live: '{n} فعال از {m}',                       // :4893
  column_count: '{n} ستون',                                // :1371
  grid_legend: 'خانهٔ قرمز یعنی مقدارش در منبع ثبت نشده یا سرِ آن اختلاف است', // :1347
  row_key_column: 'کلید ردیف',                             // :4898
  column_title_head: 'عنوان ستون',                         // :1375
  printed_rows_lede:
    'این {n} قلم از قبل روی برگه نوشته شده‌اند؛ کارمند فقط عدد جلوی هرکدام را پر می‌کند.', // :1406
  printed_row_unit: 'با چه واحدی',                         // :1418
  printed_row_section: 'در کدام بخش فرم',                  // :1425
  printed_row_day: 'چه روزی',                              // :1431
  printed_row_day_value: 'فقط {n}‌ها پر می‌شود',            // :1432
  printed_row_open_value: 'اسم قلم روی فرم چاپ نشده — کارمند خودش می‌نویسد', // :1438
  blank_master_hint: 'ستون‌ها روی برگه چاپ شده‌اند و خانه‌ها خالی‌اند',       // :1464
  day_boundary_value:
    'روز کاری تا ساعت {n} بامداد ادامه دارد؛ ثبت بعد از آن مال فردا است',    // :1463
  section_has_doc: 'شمارهٔ سند خودش را دارد',              // :1495
  signature_range: 'ردیف {n} را امضا می‌کند',              // :1508
  movement_value: 'از {n} به {m} — {r}',                    // :1517
  accounts_lede: 'دو منبع دو چیز می‌گویند. یکی را انتخاب کنید تا فیلد صریح شود.', // :1676
  measurement_quantity: 'کمیت و واحد',                     // :1622
  measurement_when_by: 'زمان · توسط',                      // :1633
  tracked_yes: 'ردیابی می‌شود',                            // :5019
  tracked_no: 'ردیابی نمی‌شود',                            // :5019
  location_sheet: 'برگهٔ {n}',                             // :4953
  location_format: 'قالب {n}',                             // :4955

  // Where a source was read — `sfSources.at` (:5050) and an account's `srcAt`
  // (:5033), which compose the same five phrases.
  source_at_sheet: 'برگهٔ {n}',                            // :5052
  source_at_sheet_cell: 'برگهٔ {n}، خانهٔ {m}',            // :5052
  source_at_lines: 'خط {n}',                               // :5052
  source_at_node: 'گرهٔ {n}',                              // :5052
  source_at_function: 'تابع {n}',                          // :5052
  source_at_page: 'صفحهٔ {n}',                             // :5052

  // The «متن اصلی» block the owner approved on 2026-08-31 (audit §6.1). The
  // three sentences are `sfOriginalNote` (:4885), which the design computes and
  // renders nowhere — one per `lang`, the third for every other value.
  original_note_gs: 'بدنهٔ اسکریپت عیناً در همین فایل نگه داشته شده است.',      // :4885
  original_note_sheets: 'فرمول شیت عیناً در همین فایل نگه داشته شده است.',      // :4886
  original_note: 'متن اصلی عیناً در همین فایل نگه داشته شده است.',              // :4887

  // The tick's own `title` (:1120) — the two hints `sfTickLabel` binds (:5071).
  tick_hint_confirmed: 'تأییدشده — اثر انگشت با محتوای فعلی می‌خواند',          // :5070
  tick_hint_unconfirmed: 'با یک تیک، کل این داده تأیید می‌شود',                 // :5070

  // The other two dialogs of :5073-5078; the confirm one is above.
  revoke_dialog_title: 'تأیید این داده برداشته شود؟',                           // :5075
  revoke_dialog_body: 'داده به حالت تأییدنشده برمی‌گردد.',                      // :5075
  account_dialog_title: 'این روایت انتخاب شود؟',                                // :5042
  account_dialog_body:
    'روایت انتخابی «انتخاب‌شده» و بقیه «ردشده» علامت می‌خورند و وضعیت فیلد صریح می‌شود.', // :5042
  // The word on each dialog's affirmative button (:5074-5078). The revoke
  // dialog's is `revoke` above — «برداشتن تأیید», the act's own name.
  confirm_dialog_ok: 'تأیید می‌کنم',                                            // :5076
  account_dialog_ok: 'انتخاب می‌کنم',                                           // :5042

  // Two joins the design writes as literals and Appendix D gives no field for.
  // They are punctuation rather than copy, and they are here for the reason
  // everything else in this block is: a component may hold no Persian.
  range_to: '{n} تا {m}',                                                       // :4943
  list_separator: '، ',                                                         // :4862

  // The two placeholders the design puts where a value would be. «؟» is a leaf
  // the source never answered (:4842, and the record grid's own `؟` at :4909);
  // «—» is a field the entry does not carry at all. They are different states
  // and the design draws them differently, so they are two entries.
  value_unknown: '؟',                                                           // :4845, :4912
  value_none: '—',                                                              // :4845

  // «{pct}٪» — the share of an input an output takes (:1318). The design writes
  // «{pct} از ورودی»; Appendix D gives `share` the label «سهم», which is what
  // stands in front of it, so this entry carries the sign alone.
  percent: '{n}٪',                                                              // :1318, :4838
}

/**
 * Weekdays, in **both spellings the store actually holds** — and the reason
 * this map exists at all is that without it the screen ships English.
 *
 * The design carries the same seven days twice, because two different parts of
 * the payload spell them differently and it never reconciled them:
 *
 * * `WD_FA` (`Inja Panel.dc.html:4691`) — the SHORT form, which a decision
 *   table's `when` cell holds: `F-00032`'s `{weekday: 'wed'}` and `F-00050`'s
 *   `{weekday: 'thu'}` are the estate's own rows.
 * * the inline `WD` inside `sfLogRows` (`:4928`) — the LONG form, which a
 *   printed form row's `when` holds: `F-00012`'s `staff_sugar` carries
 *   `"when": "thursday"`.
 *
 * One map with both key sets, rather than two maps or a normalising function:
 * the two are not variants of one value, they are two stored vocabularies, and
 * QF-42 requires a Persian label for **every** enumeration member the store
 * holds. A single lookup is also what keeps a component from deciding which
 * spelling it is looking at.
 *
 * `weekday` / `weekend` / `any` come from `WD_FA` too — a decision table's
 * `when` may name a class of days rather than one. `otherwise` is deliberately
 * NOT here: it is `SCREEN_LABELS.table_default`, the same sentence, and the
 * design's own `WD_FA` duplicating it is the kind of second definition this
 * file exists to prevent.
 *
 * **Read with `?? value`, never through `label()`.** A decision-table cell is
 * an open string — a weekday, an enumeration this file has no map for, or a
 * number — so a miss is ordinary and `label()`'s throw would be wrong. That is
 * exactly what the design's own `enumFa` does: `WD_FA[v] || … || v`.
 */
export const WEEKDAY_LABELS: Record<string, string> = {
  // `WD_FA` (:4691) — a decision table's cell
  sat: 'شنبه',
  sun: 'یکشنبه',
  mon: 'دوشنبه',
  tue: 'سه‌شنبه',
  wed: 'چهارشنبه',
  thu: 'پنجشنبه',
  fri: 'جمعه',
  weekday: 'روز هفته',
  weekend: 'آخر هفته',
  any: 'هر روز',
  // A REFERENCE and not a second definition: `SCREEN_LABELS.table_default` is
  // the same sentence the decision table's own default band draws, and this map
  // already holds seven duplicate VALUES (`sat`/`saturday`) because two stored
  // vocabularies are in play. Nothing in the estate stores `otherwise` in a
  // `when` today; `WD_FA` (:4692) carries it, so a cell that ever did would
  // otherwise read English.
  otherwise: SCREEN_LABELS.table_default,
  // the inline `WD` (:4928) — a printed form row's «فقط …‌ها پر می‌شود»
  saturday: 'شنبه',
  sunday: 'یکشنبه',
  monday: 'دوشنبه',
  tuesday: 'سه‌شنبه',
  wednesday: 'چهارشنبه',
  thursday: 'پنجشنبه',
  friday: 'جمعه',
}

/**
 * The units record's `dimension` column — `ENUM_FA`'s first seven members
 * (`Inja Panel.dc.html:4688`), which `F-00017` («واحدها») holds in the estate.
 *
 * **Its own enumeration, and NOT `QUANTITY_LABELS`**, though four keys overlap:
 * a measurement's `quantity` is «وزن / مدت / مبلغ» (Appendix D) and a unit's
 * dimension is «جرم / زمان / پول» (the design). Same English word, two
 * enumerations, two Persian words — exactly the collision this file's per-map
 * shape exists to keep apart, and the reason a flat dictionary would ship the
 * wrong word in one of the two places.
 *
 * Appendix D has no table for it, because `facts.schema.json` types `data` as
 * an unconstrained object and a config record's column set is not frozen; the
 * design is the source, transcribed.
 */
export const DIMENSION_LABELS: Record<string, string> = {
  mass: 'جرم',
  volume: 'حجم',
  count: 'تعداد',
  pack: 'بسته',
  duration: 'زمان',
  money: 'پول',
  dimensionless: 'بی‌بعد',
}

/**
 * An item's `group` — `GROUP_FA` (`:4684`), transcribed.
 *
 * Conformance note 9 says this map is replaced by *"`resolved` / the group's own
 * `title`"*, and **neither is served**: `facts_store._labels` maps ids and item
 * keys only (`facts_store.py:291`), and a group key is neither. So the design's
 * own map is what is left, and it goes here rather than into a component, which
 * is the half of note 9 that still binds.
 */
export const GROUP_LABELS: Record<string, string> = {
  cold_cuts: 'کالباس و فرآورده',
  dough: 'خمیر',
  cheese: 'پنیر',
  sauce: 'سس',
  bread: 'نان',
  vegetable: 'سبزیجات',
  meat: 'گوشت',
  chicken: 'مرغ',
  potato: 'سیب‌زمینی',
  drink: 'نوشیدنی',
  packaging: 'بسته‌بندی',
  starter: 'پیش‌غذا',
  american_pizza: 'پیتزا امریکایی',
  italian_pizza: 'پیتزا ایتالیایی',
  burger: 'برگر',
  sandwich: 'ساندویچ',
  side: 'مخلفات',
  spice: 'ادویه',
}

/**
 * The Persian for one **open** cell value — the design's `enumFa` (`:4693`),
 * which is `WD_FA || ENUM_FA || GROUP_FA || v`.
 *
 * ## Why this is a chain and not a `label()` call
 *
 * A decision-table cell (`:4857`, `:4860`) and a record-grid cell (`:4912`) hold
 * whatever the source wrote: a weekday, a dimension, a group, a product name, a
 * number. There is no enumeration to name, so `label()`'s throw would fire on
 * ordinary data. The design's own fallback is the stored value and so is this
 * one — which is also what keeps a screen honest: an English word here means the
 * store holds a value no map covers, and it is visible rather than blank.
 *
 * ## Why the order is the design's
 *
 * `WD_FA` first, then `ENUM_FA`, then `GROUP_FA`. Two keys are in more than one
 * map and the order decides them: `pack` is a dimension here and «بسته‌بندی» is
 * `packaging` in the group map, so they do not collide; `place` is `ENUM_FA`'s
 * «مکان» and `CATEGORY_LABELS`' «محل نگهداری», and **Appendix D wins** — a
 * category is an enumeration the appendix names, so `CATEGORY_LABELS` is
 * consulted for it rather than a transcription of the design's word.
 *
 * `STATE_LABELS` and `CATEGORY_LABELS` cover `ENUM_FA`'s remaining seven members
 * (`raw`/`cooked`/`prepared`, `ingredient`/`product`/`place`/`consumable`)
 * without restating one of them.
 */
export function cellLabel(value: string): string {
  return WEEKDAY_LABELS[value]
    ?? DIMENSION_LABELS[value]
    ?? STATE_LABELS[value]
    ?? CATEGORY_LABELS[value]
    ?? GROUP_LABELS[value]
    ?? value
}

/**
 * The Persian for one stored value — **and a build failure when there is none.**
 *
 * `roleLabel`'s sibling, with the opposite answer to a missing key, and the
 * difference is deliberate. A role is *seeded* and a role this build has no
 * wording for is a real server-side state, so `roleLabel` quotes the
 * identifier. An enumeration member is *frozen in a schema* this repo owns, so a
 * value with no label is a schema edit that forgot this file — a defect, and one
 * that would otherwise ship an English word onto a Persian screen. In
 * development it throws where it happened; in production it degrades to the raw
 * value rather than blanking a screen, because a reader seeing `sheets` is
 * better served than a reader seeing nothing.
 *
 * `null` / `undefined` answer `''`: a field the server did not send is not a
 * missing label, and «—» would be a claim this function is not entitled to make
 * — the caller knows whether an absent value means "none" or "not told".
 */
export function label(map: Record<string, string>, value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  const found = map[value]
  if (found !== undefined) return found
  if (import.meta.env.DEV) {
    throw new Error(`factsLabels: no Persian label for «${value}» — add it to the map in src/lib/factsLabels.ts (spec Appendix D)`)
  }
  return value
}
