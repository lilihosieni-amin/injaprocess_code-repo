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
})
