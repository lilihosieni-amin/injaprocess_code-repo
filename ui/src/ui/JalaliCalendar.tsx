import { useEffect, useRef, useState } from 'react'
import { dayOf, jalaliDay, jalaliParts, toFa } from '../lib/format'
import { pushDismissible, popDismissible, isTopDismissible } from './dismissibleStack'
import { Icon } from './Icon'

const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
                'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند']
const WEEK = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج']

/** The Jalali month `day` falls in: its first day number, its length, year, month.
 *  Walks day numbers rather than converting back from Jalali — `format.ts` only
 *  has Gregorian → Jalali, and a month is at most 31 steps. */
export function monthOf(day: number): { first: number; length: number; y: number; m: number } {
  const [y, m, d] = jalaliParts(day)
  const first = day - (d - 1)
  let length = 29
  while (length < 31 && jalaliParts(first + length)[2] !== 1) length++
  return { first, length, y, m }
}

const latest = (days: Record<string, number>): number | undefined => {
  const keys = Object.keys(days).map(Number)
  return keys.length ? Math.max(...keys) : undefined
}

export function JalaliCalendar({ days, value, onPick }: {
  days: Record<string, number>; value: number | null; onPick: (day: number | null) => void
}) {
  const [anchor, setAnchor] = useState(() => value ?? latest(days) ?? dayOf(Date.now() / 1000))
  const { first, length, y, m } = monthOf(anchor)
  const lead = (new Date(first * 86400000).getUTCDay() + 1) % 7      // Saturday first
  return (
    <div data-cal className="w-cal">
      <div className="flex items-center justify-between mb-s5">
        {/* next month sits on the LEFT in RTL — Pager's rule */}
        <button type="button" aria-label="ماه بعد" onClick={() => setAnchor(first + length)}>
          <Icon name="chevronNext" stroke={2.6} className="w-chevron h-chevron" />
        </button>
        <span className="text-fs-sm font-bold text-ink">{`${MONTHS[m - 1]} ${toFa(y)}`}</span>
        <button type="button" aria-label="ماه قبل" onClick={() => setAnchor(first - 1)}>
          <Icon name="chevronPrev" stroke={2.6} className="w-chevron h-chevron" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-s1 text-center">
        {WEEK.map((w) => <span key={w} className="text-caption text-muted">{w}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} data-cal-blank />)}
        {Array.from({ length }, (_, n) => {
          const day = first + n
          const count = days[String(day)] ?? 0
          const on = value === day
          return (
            <button key={day} type="button" disabled={!count} aria-pressed={on}
              title={count ? `${toFa(count)} رویداد` : 'بدون رویداد'}
              onClick={() => onPick(on ? null : day)}
              className={`h-cal-cell rounded-input text-fs-sm ${on ? 'bg-violet text-white font-bold'
                : count ? 'bg-tile-v2 text-violet font-bold' : 'text-faint'}`}>
              {toFa(n + 1)}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A filter-bar trigger that opens the calendar, with «همهٔ تاریخ‌ها» to clear.
 *  The trigger and popover borrow Dropdown's own class strings (`Dropdown.tsx`)
 *  and its identical Escape/outside-click contract, rather than reimplementing
 *  a second popover shell for one more caller. */
export function CalendarFilter({ days, value, onPick }: {
  days: Record<string, number>; value: number | null; onPick: (day: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const identity = useRef(Symbol('calendar')).current
  useEffect(() => {
    if (!open) return
    pushDismissible(identity)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && isTopDismissible(identity)) setOpen(false) }
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      popDismissible(identity)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, identity])
  const pick = (d: number | null) => { onPick(d); setOpen(false) }
  return (
    <div ref={box} className="relative">
      <button type="button" aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-s5 px-s7 py-s5 rounded-button bg-card text-ink text-start cursor-pointer border-hairline ${open ? 'border-coral' : 'border-line'} text-fs-menu`}>
        {value === null ? 'همهٔ تاریخ‌ها' : jalaliDay(value)}
      </button>
      {open && (
        <div role="dialog" aria-label="انتخاب روز"
          className="absolute top-full mt-s3 start-0 end-0 z-dropdown max-h-popover overflow-auto flex flex-col gap-half p-popover bg-card border border-border-card rounded-card shadow-pop">
          <JalaliCalendar days={days} value={value} onPick={pick} />
          <button type="button" onClick={() => pick(null)}>همهٔ تاریخ‌ها</button>
        </div>
      )}
    </div>
  )
}
