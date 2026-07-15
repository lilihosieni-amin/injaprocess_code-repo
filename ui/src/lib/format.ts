import type { Process } from '../api/types'

const FA = '۰۱۲۳۴۵۶۷۸۹'

export function toFa(x: string | number): string {
  return String(x).replace(/[0-9]/g, (d) => FA[Number(d)])
}

// Gregorian → Jalali (proleptic). Adapted from the standard jalaali algorithm.
function toJalali(gy: number, gm: number, gd: number): [number, number, number] {
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
  const p = (n: number) => toFa(String(n).padStart(2, '0'))
  return `${toFa(jy)}/${p(jm)}/${p(jd)}`
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

export type TagKind = 'sub' | 'conflict' | 'kpi' | 'plain' | 'tombstone'

export function deriveTag(p: Process): { label: string; kind: TagKind } {
  if (p.tombstoned) return { label: 'باطل‌شده', kind: 'tombstone' }
  if (p.parent) return { label: 'زیرفرآیند', kind: 'sub' }
  if (p.pending && p.pending.length) return { label: `${toFa(p.pending.length)} تعارض`, kind: 'conflict' }
  if (p.kpis && p.kpis.length) return { label: 'دارای KPI', kind: 'kpi' }
  return { label: 'مستند', kind: 'plain' }
}
