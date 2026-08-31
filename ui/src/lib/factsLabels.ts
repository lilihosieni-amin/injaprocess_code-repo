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
 * `factsLabels.test.ts` reads `facts.schema.json`, `manifest.schema.json` and
 * `facts-run-meta.schema.json` and asserts every `enum` member and `const` in
 * them has a label here. **A value added to a schema without a label fails the
 * build** rather than leaking an English word onto a Persian screen.
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

  // the four filters, in the design's own order (Inja Panel.dc.html:4640)
  filter_kind: 'نوع',
  filter_scope: 'دپارتمان',
  filter_branch: 'شعبه',
  filter_confirmation: 'وضعیت تأیید',

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
