import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { FactsList } from './FactsList'
import type { Branch, Department, FactListRow, FactsListResponse } from '../api/types'

/**
 * The screen reads three endpoints and nothing else: the listing, the branch
 * registry (QF-4) and the department registry — the last two only because
 * conformance note 9 forbids the design's inline `DEPT_FA`/`BRANCH_FA` maps.
 * They are mocked at the hook rather than at `fetch` so a change to either
 * query key is a compile error here instead of a silently empty menu.
 */
const facts = vi.fn()
const branches = vi.fn()
const departments = vi.fn()

vi.mock('../api/hooks', () => ({
  useFacts: () => facts(),
  useFactBranches: () => branches(),
  useDepartments: () => departments(),
}))

const row = (over: Partial<FactListRow>): FactListRow => ({
  id: 'F-00001', kind: 'item', key: 'ing_1', title: 'پنیر پیتزا', aliases: [],
  scope: { departments: [], branches: [] },
  status: 'confirmed', retired: false, stub: false,
  red_counts: { unknown: 0, disputed: 0 },
  fingerprint: 'a1', confirmed: true, updated_at: '2026-09-16T14:05:00Z',
  ...over,
})

/** Universal, confirmed, nothing beside its chip. */
const CHEESE = row({})
/** Red on both counts, unconfirmed, in a department and a branch. */
const NIGHT = row({
  id: 'F-00011', kind: 'record', key: 'night', title: 'مانده شب فرنگی و برگر',
  scope: { departments: ['cooking'], branches: ['chalebagh'] },
  status: 'unknown', confirmed: false, red_counts: { unknown: 4, disputed: 2 },
})
/** Pre-registered and retired at once, so both badges are proved on one row. */
const STUB = row({
  id: 'F-00022', kind: 'record', key: 'unknown_book', title: 'کاربرگ ناشناخته',
  scope: { departments: ['management'], branches: [] },
  stub: true, retired: true, confirmed: false,
})

const DEPARTMENTS: Department[] = [
  { code: 'cooking', name: 'آشپزخانه', count: 3, subs: 0, conflicts: 0 },
  { code: 'management', name: 'مدیریت', count: 1, subs: 0, conflicts: 0 },
]
const BRANCHES: Branch[] = [
  { code: 'chalebagh', name: 'چاله‌باغ' },
  { code: 'naharkhoran', name: 'ناهارخوران' },
]

const listing = (entries: FactListRow[]): { data: FactsListResponse } => ({
  data: { entries, coverage: { read: 19, total: 28 } },
})

function draw(entries: FactListRow[] = [CHEESE, NIGHT, STUB]) {
  facts.mockReturnValue({ ...listing(entries), error: null, isPending: false, refetch: vi.fn() })
  return render(<MemoryRouter><FactsList /></MemoryRouter>)
}

beforeEach(() => {
  branches.mockReturnValue({ data: BRANCHES })
  departments.mockReturnValue({ data: DEPARTMENTS })
})

const rowFor = (title: string) => screen.getByRole('row', { name: new RegExp(title) })

describe('the facts list', () => {
  it('draws the screen title the design draws, and no second line', () => {
    draw()
    expect(screen.getByRole('heading', { name: 'داده‌های کمّی' })).toBeInTheDocument()
    // C1 — the owner refused the coverage line on 2026-08-31. The number is
    // served (`coverage` above) and drawn nowhere, which is what the design does
    // with `factsCoverage` (`Inja Panel.dc.html:4798`). Do not re-propose.
    expect(screen.queryByText(/کاربرگ خوانده شده/)).toBeNull()
  })

  it('draws one row per entry, with the five cells the design draws', () => {
    draw()
    const r = rowFor('پنیر پیتزا')
    expect(within(r).getByText('F-00001')).toBeInTheDocument()
    expect(within(r).getByText('آیتم')).toBeInTheDocument()
    // An entry that names no department and no branch is «کل سامانه» — the whole
    // installation, not a blank cell (`scopeLine`, :4634).
    expect(within(r).getByText('کل سامانه')).toBeInTheDocument()
    expect(within(r).getByText('تأییدشده')).toBeInTheDocument()
  })

  it('writes the scope from the two registries, never from an inline map', () => {
    // Conformance note 9: «آشپزخانه» comes from GET /api/departments and
    // «چاله‌باغ» from GET /api/facts/branches, joined the way the design joins
    // them.
    draw()
    expect(within(rowFor('مانده شب')).getByText('آشپزخانه · چاله‌باغ')).toBeInTheDocument()
  })

  it('shows the red counts beside the chip, in Persian digits', () => {
    // Conformance note 1 — the chip stays two-valued and carries none of this;
    // the counts fill the `r.hasNote` slot the design drew and never wired.
    draw()
    const r = rowFor('مانده شب')
    expect(within(r).getByText('تأییدنشده')).toBeInTheDocument()
    expect(within(r).getByText('۴ بی‌پاسخ · ۲ متعارض')).toBeInTheDocument()
  })

  it('shows no count line at all for a row with nothing to say', () => {
    draw()
    expect(within(rowFor('پنیر پیتزا')).queryByText(/بی‌پاسخ|متعارض/)).toBeNull()
  })

  it('badges a pre-registered and a retired entry', () => {
    draw()
    expect(within(rowFor('کاربرگ ناشناخته')).getByText('پیش‌ثبت · بازنشسته'))
      .toBeInTheDocument()
  })

  it('draws NO confirm tick on a row', () => {
    // The row's six cells are title, id, kind, scope, the status block and the
    // chevron (`Inja Panel.dc.html:1052-1070`). The tick is `sfCanTick`, on the
    // detail screen, and a list that offered one would be confirming an entry
    // nobody had opened.
    draw()
    // Scoped to the rows: the «وضعیت تأیید» filter above them is a button with
    // «تأیید» in its name, and an unscoped query would pass by matching it.
    for (const r of screen.getAllByRole('row').slice(1)) {
      expect(within(r).queryByRole('checkbox')).toBeNull()
      expect(within(r).queryByRole('button')).toBeNull()
    }
  })

  it('states the empty case in the design’s own words', () => {
    draw([])
    expect(screen.getByText('با این فیلترها داده‌ای نیست')).toBeInTheDocument()
  })
})

describe('the filters', () => {
  it('offers exactly the two confirmation values', async () => {
    // `CONF` has two keys and folds everything else to «تأییدنشده» (:4624). The
    // stale «سه حالت» comment above it is not the code.
    draw()
    await userEvent.click(screen.getByRole('button', { name: /وضعیت تأیید/ }))
    const menu = screen.getByRole('listbox', { name: 'وضعیت تأیید' })
    expect(within(menu).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['وضعیت تأیید', 'تأییدشده', 'تأییدنشده'])
  })

  it('offers «سراسری» beside the departments', async () => {
    draw()
    await userEvent.click(screen.getByRole('button', { name: /دپارتمان/ }))
    const menu = screen.getByRole('listbox', { name: 'دپارتمان' })
    expect(within(menu).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['دپارتمان', 'آشپزخانه', 'مدیریت', 'سراسری'])
  })

  it('narrows the list when one is picked', async () => {
    draw()
    await userEvent.click(screen.getByRole('button', { name: /نوع/ }))
    await userEvent.click(screen.getByRole('option', { name: 'جدول' }))
    expect(screen.queryByText('پنیر پیتزا')).toBeNull()
    expect(screen.getByText('مانده شب فرنگی و برگر')).toBeInTheDocument()
  })

  it('hides the clear-filters link until something is set, and clears with it', async () => {
    // R5 — absent, not disabled. `hasFactFilters` counts the query too (:4807).
    draw()
    expect(screen.queryByRole('button', { name: 'پاک کردن همهٔ فیلترها' })).toBeNull()

    await userEvent.type(screen.getByRole('searchbox'), 'پنیر')
    const clear = screen.getByRole('button', { name: 'پاک کردن همهٔ فیلترها' })
    expect(screen.queryByText('مانده شب فرنگی و برگر')).toBeNull()

    await userEvent.click(clear)
    expect(screen.getByText('مانده شب فرنگی و برگر')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'پاک کردن همهٔ فیلترها' })).toBeNull()
  })
})
