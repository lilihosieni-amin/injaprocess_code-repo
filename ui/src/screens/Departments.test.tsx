import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Departments } from './Departments'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

describe('Departments', () => {
  it('renders department cards with Persian counts, sub/conflict badges, and header stats', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify([
        { code: 'cooking', name: 'پخت', count: 12, subs: 2, conflicts: 1 },
        { code: 'cashier', name: 'صندوق', count: 3, subs: 0, conflicts: 0 },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    renderAt('/departments', <Departments />, '/departments')
    // card title now carries the "دپارتمان" prefix
    expect(await screen.findByText('دپارتمان پخت')).toBeInTheDocument()
    expect(screen.getByText('دپارتمان صندوق')).toBeInTheDocument()
    // per-card badges
    expect(screen.getByText('۱۲ فرآیند')).toBeInTheDocument()
    expect(screen.getByText('۲ زیرفرآیند')).toBeInTheDocument()
    expect(screen.getByText('۱ تعارض')).toBeInTheDocument()
    // header summary stats: total processes 12+3=15, and the open-conflict stat label
    expect(screen.getByText('۱۵')).toBeInTheDocument()
    expect(screen.getByText('فرآیند مستند')).toBeInTheDocument()
    expect(screen.getByText('تعارض باز')).toBeInTheDocument()
  })

  // GET /api/departments serves `conflicts` only to someone who may edit that
  // department, and it is ABSENT rather than zero for everyone else. A reader
  // must therefore not be shown ۰ open conflicts: zero is an answer, and it is
  // the wrong one whenever a conflict exists.
  it('says nothing at all about open conflicts when the count was not served', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify([
        { code: 'cooking', name: 'پخت', count: 12, subs: 2 },
        { code: 'cashier', name: 'صندوق', count: 3, subs: 0 },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    renderAt('/departments', <Departments />, '/departments')
    expect(await screen.findByText('دپارتمان پخت')).toBeInTheDocument()
    // the stat tile is gone entirely — no label, and no ۰ standing in for it —
    // and no per-card badge either: the word does not appear on the screen at all
    expect(screen.queryByText('تعارض باز')).not.toBeInTheDocument()
    expect(screen.queryByText('۰')).not.toBeInTheDocument()
    expect(screen.queryByText(/تعارض/)).not.toBeInTheDocument()
    // the rest of the board is untouched
    expect(screen.getByText('۱۵')).toBeInTheDocument()
    expect(screen.getByText('فرآیند مستند')).toBeInTheDocument()
    expect(screen.getByText('۲ زیرفرآیند')).toBeInTheDocument()
  })

  // The mixed case a scoped editor actually sees: served for the department they
  // may edit, withheld for the one they may not. The tile then reports what they
  // were told and nothing more.
  it('counts only the departments whose conflicts were served', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify([
        { code: 'cooking', name: 'پخت', count: 12, subs: 2, conflicts: 3 },
        { code: 'cashier', name: 'صندوق', count: 3, subs: 0 },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    renderAt('/departments', <Departments />, '/departments')
    // wait for a card: the header stats render before the board resolves, and
    // every count reads ۰ until it does
    expect(await screen.findByText('دپارتمان پخت')).toBeInTheDocument()
    expect(screen.getByText('تعارض باز')).toBeInTheDocument()
    expect(screen.getByText('۳')).toBeInTheDocument()
    expect(screen.getByText('۳ تعارض')).toBeInTheDocument()          // cooking's own badge
    expect(screen.queryByText('۰ تعارض')).not.toBeInTheDocument()    // cashier gets no badge
  })
})
