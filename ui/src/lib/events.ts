/** Persian names for the activity record's events (addendum D76). The design's
 *  own strings are kept where it has one; the rest are proposals the owner
 *  confirmed in Task 12 Step 1. */
export const EVENT_LABEL: Record<string, string> = {
  'login.success': 'ورود موفق', 'login.failure': 'ورود ناموفق',
  'login.throttled': 'ورود متوقف‌شده — تلاش زیاد', logout: 'خروج',
  'session.revoked': 'ابطال نشست', 'password.changed': 'تغییر گذرواژه',
  'access.denied': 'اقدام بدون مجوز',
  'department.viewed': 'مشاهدهٔ دپارتمان', 'process.viewed': 'مشاهدهٔ فرآیند',
  'report.downloaded': 'دریافت فایل نمایش', 'process.edited': 'ویرایش فرآیند',
  'department.edited': 'ویرایش دپارتمان', 'fact.edited': 'ویرایش دادهٔ کمّی',
  'confirmation.set': 'تأیید', 'confirmation.revoked': 'پس‌گرفتن تأیید',
  'confirmation.invalidated': 'باطل‌شدن تأیید',
  'user.created': 'ساخت کاربر', 'user.modified': 'ویرایش کاربر',
  'user.disabled': 'غیرفعال‌سازی کاربر', 'user.enabled': 'فعال‌سازی دوبارهٔ کاربر',
  'password.set_by_admin': 'تعیین گذرواژه توسط مدیر', 'role.assigned': 'تغییر نقش',
  'scope.granted': 'افزودن دسترسی', 'scope.revoked': 'گرفتن دسترسی',
  'supervisor.changed': 'تغییر سرپرست', 'supervisor_flag.changed': 'تغییر پرچم سرپرست‌شدن',
  'visibility.policy.changed': 'تغییر سیاست نمایش',
  'comment.created': 'ثبت کامنت', 'comment.edited': 'ویرایش کامنت',
  'comment.withdrawn': 'پس‌گرفتن کامنت', 'comment.restored': 'ارسال دوبارهٔ کامنت',
  'comment.approved': 'تأیید کامنت',
  'comment.noted': 'یادداشت روی کامنت', 'comment.rejected': 'رد کامنت',
  'comment.addressed': 'رسیدگی به کامنت', 'projection.discontinuity': 'گسست در تاریخچهٔ داده',
}

export const eventLabel = (action: string): string => EVENT_LABEL[action] ?? action

/** «کروم · ویندوز» — the design's device column.
 *  ponytail: naive user-agent sniffing, good for a label and nothing else. */
export function uaLabel(ua: string): string {
  if (!ua) return '—'
  const browser = /Edg\//.test(ua) ? 'اج' : /Firefox\//.test(ua) ? 'فایرفاکس'
    : /Chrome\//.test(ua) ? 'کروم' : /Safari\//.test(ua) ? 'سافاری' : 'مرورگر'
  const os = /Android/.test(ua) ? 'اندروید' : /iPhone|iPad/.test(ua) ? 'آیفون'
    : /Windows/.test(ua) ? 'ویندوز' : /Mac OS X/.test(ua) ? 'مک' : /Linux/.test(ua) ? 'لینوکس' : ''
  return os ? `${browser} · ${os}` : browser
}

/** The comment-flow tab's state pill — the design's ST_OPTS wording. */
export const COMMENT_STATE: Record<string, { label: string; tone: 'warn' | 'info' | 'ok' | 'danger' | 'neutral' }> = {
  awaiting: { label: 'در انتظار تأیید', tone: 'warn' },
  approved: { label: 'رسیده به ادیتور', tone: 'info' },
  addressed: { label: 'رسیدگی‌شده', tone: 'ok' },
  rejected: { label: 'ردشده', tone: 'danger' },
  withdrawn: { label: 'پس‌گرفته', tone: 'neutral' },
}

/** Who holds a comment now — PanelInbox's `waitingWith` wording (D63). */
export function hopLabel(c: { state: string; stage: string | null; holder: string | null }): string {
  if (c.state === 'awaiting') return c.stage === 'pool' ? 'ادمین‌ها' : (c.holder ?? '—')
  if (c.state === 'approved') return 'ادیتور'
  return '—'
}
