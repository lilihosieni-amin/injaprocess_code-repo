import type { Process } from '../api/types'

const FA = '۰۱۲۳۴۵۶۷۸۹'

export function toFa(x: string | number): string {
  return String(x).replace(/[0-9]/g, (d) => FA[Number(d)])
}

/** Persian digits, zero-padded to two — «۰۱», «۱۲», «۱۰۰». Section and sheet
 *  numbers in the exported documents are all written this way. */
export function pad2(n: number | string): string {
  return toFa(String(n).padStart(2, '0'))
}

// Gregorian → Jalali (proleptic). Adapted from the standard jalaali algorithm.
export function toJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  let jy = gy <= 1600 ? 0 : 979
  gy -= gy <= 1600 ? 621 : 1600
  const gy2 = gm > 2 ? gy + 1 : gy
  let days =
    365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) - 80 + gd + gdm[gm - 1]
  jy += 33 * Math.floor(days / 12053)
  days %= 12053
  jy += 4 * Math.floor(days / 1461)
  days %= 1461
  jy += Math.floor((days - 1) / 365)
  if (days > 365) days = (days - 1) % 365
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30)
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30)
  return [jy, jm, jd]
}

export function jalali(iso: string): string {
  const d = new Date(iso)
  const [jy, jm, jd] = toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  return `${toFa(jy)}/${pad2(jm)}/${pad2(jd)}`
}

const ICOM_LABELS: Record<string, string> = {
  inputs: 'ورودی‌ها', controls: 'کنترل‌ها', outputs: 'خروجی‌ها', mechanisms: 'مکانیزم‌ها',
}

// Render a pending conflict's current/proposed value as readable text. Values are
// strings (description/actor), the icom object {inputs,controls,outputs,mechanisms},
// or an array; a plain String() would print "[object Object]".
export function formatConflictValue(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return toFa(String(v))
  if (Array.isArray(v)) {
    const items = v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
    return items.length ? items.join('، ') : '—'
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    const keys = Object.keys(o)
    if (keys.length > 0 && keys.every((k) => k in ICOM_LABELS)) {
      const parts = keys
        .filter((k) => Array.isArray(o[k]) && (o[k] as unknown[]).length > 0)
        .map((k) => `${ICOM_LABELS[k]}: ${(o[k] as unknown[]).map(String).join('، ')}`)
      return parts.length ? parts.join('\n') : '—'
    }
    return JSON.stringify(o)
  }
  return String(v)
}

export type TagKind = 'sub' | 'conflict' | 'tombstone'

/**
 * Owner ruling R28, ledger L-12 — a plain process draws NO tag, so this returns
 * null for it rather than a further kind.
 *
 * A tag marks an exception: a sub-process, a conflict, a tombstone. One that
 * says «مستند» on a screen where every row is a document marks nothing, and its
 * skin was byte-identical to the KPI tag, so two of the five tags were
 * indistinguishable. Returning null makes the rule structural: no screen can
 * render the tag by reaching for a tone that no longer exists.
 *
 * **«دارای KPI» is gone too, by a later ruling** — *"delete kpi tag too"*, in
 * the same breath as the sub-process card and the confirmation chip. It is the
 * one kind that marked no exception at all: having a KPI is what a documented
 * process is *supposed* to have, so the tag fired on the ordinary case and
 * stayed dark on the one worth noticing. R28's own argument, one tag further
 * along. `--tile-v`/`--violet` — the pair it wore — go back to being the
 * department glyph's, and this file names three kinds where it named four.
 */
export function deriveTag(p: Process): { label: string; kind: TagKind } | null {
  if (p.tombstoned) return { label: 'باطل‌شده', kind: 'tombstone' }
  if (p.parent) return { label: 'زیرفرآیند', kind: 'sub' }
  if (p.pending && p.pending.length) return { label: `${toFa(p.pending.length)} تعارض`, kind: 'conflict' }
  return null
}

/** Iran's fixed UTC+03:30 — the server's `store/activity.TEHRAN_OFFSET_S`.
 *  ponytail: no DST since 2022; a zone change means both sides change. */
export const TEHRAN_OFFSET_S = 12600

/** The server's day number for a unix time — what `/api/activity` keys days by. */
export const dayOf = (at: number): number => Math.floor((at + TEHRAN_OFFSET_S) / 86400)

export function jalaliParts(day: number): [number, number, number] {
  const d = new Date(day * 86400000)
  return toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

export function jalaliDay(day: number): string {
  const [y, m, d] = jalaliParts(day)
  return `${toFa(y)}/${pad2(m)}/${pad2(d)}`
}

export function clockFa(at: number): string {
  const d = new Date((at + TEHRAN_OFFSET_S) * 1000)
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
}

/** «امروز، ۱۰:۲۴» · «دیروز، ۲۰:۰۵» · «۱۴۰۵/۰۴/۲۹» — the design's "last seen". */
export function whenFa(at: number | null, now: number = Date.now() / 1000): string {
  if (at === null) return '—'
  const gap = dayOf(now) - dayOf(at)
  if (gap === 0) return `امروز، ${clockFa(at)}`
  if (gap === 1) return `دیروز، ${clockFa(at)}`
  return jalaliDay(dayOf(at))
}

/** «۳ ساعت و ۱۲ دقیقه» · «۵۲ دقیقه» — active time. */
export function durationFa(seconds: number): string {
  if (seconds <= 0) return '—'
  const minutes = Math.floor(seconds / 60)
  if (minutes === 0) return 'کمتر از یک دقیقه'
  const h = Math.floor(minutes / 60), m = minutes % 60
  if (h === 0) return `${toFa(m)} دقیقه`
  return m === 0 ? `${toFa(h)} ساعت` : `${toFa(h)} ساعت و ${toFa(m)} دقیقه`
}

/** «۶ روز» — how long a comment has sat where it is. */
export function daysSinceFa(at: number | null, now: number = Date.now() / 1000): string {
  return at === null ? '—' : `${toFa(Math.max(0, dayOf(now) - dayOf(at)))} روز`
}
