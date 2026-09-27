import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JalaliCalendar, monthOf } from './JalaliCalendar'
import { dayOf } from '../lib/format'

const MEHR_1 = dayOf(Date.UTC(2026, 8, 23, 12) / 1000)      // 1 Mehr 1405, a Wednesday

describe('JalaliCalendar', () => {
  it('finds the month a day belongs to', () => {
    expect(monthOf(MEHR_1 + 4)).toEqual({ first: MEHR_1, length: 30, y: 1405, m: 7 })
  })
  it('offers only the days that have events, and picks one', async () => {
    const onPick = vi.fn()
    render(<JalaliCalendar days={{ [String(MEHR_1 + 4)]: 3 }} value={null} onPick={onPick} />)
    expect(screen.getByText('مهر ۱۴۰۵')).toBeTruthy()
    expect((screen.getByRole('button', { name: '۴' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: '۵' }))
    expect(onPick).toHaveBeenCalledWith(MEHR_1 + 4)
  })
  it('starts the month on its real weekday', () => {
    // 1 Mehr 1405 is a Wednesday — the 5th column of a Saturday-first week
    const { container } = render(
      <JalaliCalendar days={{ [String(MEHR_1)]: 1 }} value={null} onPick={() => {}} />)
    expect(container.querySelectorAll('[data-cal-blank]').length).toBe(4)
  })

  it('points its two chevrons Pager’s way, and never inward', () => {
    // Pager's rule (Pager.tsx L29-47, pinned for Pager itself in
    // src/ui/table.test.tsx): the FIRST button in the DOM renders on the RIGHT
    // in RTL, and «قبلی» is first, pointing right at where the previous item
    // lies. The design draws this calendar the same way (Inja Panel.dc.html
    // L2374-2391): `aCalPrev` first with `M9 6l6 6-6 6`, `aCalNext` second with
    // `M15 6l-6 6 6 6` — the same two `d`s Pager's own chevrons carry.
    const { container } = render(
      <JalaliCalendar days={{ [String(MEHR_1)]: 1 }} value={null} onPick={() => {}} />)
    const d = (name: string) =>
      screen.getByRole('button', { name }).querySelector('path')!.getAttribute('d')
    expect(d('ماه قبل')).toBe('M9 6l6 6-6 6')
    expect(d('ماه بعد')).toBe('M15 6l-6 6 6 6')
    // A pairing, not two independent literals: both lines above would still
    // pass if the component drew one glyph twice and the labels traded DOM
    // positions instead.
    expect(
      Array.from(container.querySelectorAll('[aria-label]')).map((b) => b.getAttribute('aria-label')),
    ).toEqual(['ماه قبل', 'ماه بعد'])
    expect(d('ماه قبل')).not.toBe(d('ماه بعد'))
  })

  it('moves a month at a time, backward and forward', async () => {
    render(<JalaliCalendar days={{ [String(MEHR_1)]: 1 }} value={null} onPick={() => {}} />)
    expect(screen.getByText('مهر ۱۴۰۵')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'ماه قبل' }))
    expect(screen.getByText('شهریور ۱۴۰۵')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'ماه بعد' }))
    await userEvent.click(screen.getByRole('button', { name: 'ماه بعد' }))
    expect(screen.getByText('آبان ۱۴۰۵')).toBeTruthy()
  })
})
