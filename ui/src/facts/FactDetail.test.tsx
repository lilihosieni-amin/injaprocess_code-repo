import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { FactDetail } from './FactDetail'
import { bundleOf } from './cards/fixture'
import type { Branch, Department, FactBundle } from '../api/types'

const fact = vi.fn()
const branches = vi.fn()
const departments = vi.fn()
vi.mock('../api/hooks', () => ({
  useFact: (fid: string) => fact(fid),
  useFactBranches: () => branches(),
  useDepartments: () => departments(),
  useResolveFact: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useSetFactConfirmation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useRevokeFactConfirmation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}))

const DEPARTMENTS: Department[] = [
  { code: 'cooking', name: 'آشپزخانه', count: 3, subs: 0, conflicts: 0 },
]
const BRANCHES: Branch[] = [{ code: 'chalebagh', name: 'چاله‌باغ' }]

beforeEach(() => {
  branches.mockReturnValue({ data: BRANCHES })
  departments.mockReturnValue({ data: DEPARTMENTS })
})

function draw(bundle: FactBundle) {
  fact.mockReturnValue({ data: bundle, error: null, isPending: false, refetch: vi.fn() })
  return render(
    <MemoryRouter initialEntries={[`/facts/${bundle.entry.id}`]}>
      <Routes><Route path="/facts/:fid" element={<FactDetail />} /></Routes>
    </MemoryRouter>,
  )
}

/** A paper log — the kind·role·medium line the owner approved (audit §6.2). */
const PAPER = bundleOf('record', {
  medium: 'paper', role: 'log',
  location: { spreadsheetId: '15M2ovUmQ7kX3nR9pLwT2aB8cD4eF6gH1' },
}, {
  processes: [
    { ref: 'cooking-001', title: 'وزن‌کشی مانده شب', tombstoned: false, heir: null, missing_nodes: [] },
    { ref: 'cooking-002', title: 'شمارش انبار', tombstoned: true, heir: 'cooking-007', missing_nodes: [] },
    { ref: 'cooking-003', title: null, tombstoned: false, heir: null, missing_nodes: [] },
    { ref: 'cooking-004', title: 'ثبت فیش', tombstoned: false, heir: null,
      missing_nodes: ['cooking-004-n010'] },
    { ref: 'cooking-005', restricted: true },
  ],
  consumers: [
    { id: 'F-00031', title: 'مصرف استاندارد پیتزا' },
    { id: 'F-00099', restricted: true },
  ],
}, {
  id: 'F-00011', key: 'mande_shab', title: 'مانده شب فرنگی و برگر',
  statement: 'فرم کاغذی مانده شب بخش فرنگی.',
  aliases: ['مانده شب'],
  scope: { departments: ['cooking'], branches: ['chalebagh'] },
  source: [{ type: 'photo', ref: 'departments/cooking/attachments/photo.jpg' }],
})

describe('the fact detail screen', () => {
  it('names the kind, the role and the medium on one line, with «·» between', () => {
    draw(PAPER)
    // Audit §6.2 — the owner placed `medium` on the line that already answers
    // "what kind of thing is this", using that line's own separator.
    expect(screen.getByText('جدول · جدول ثبت · فرم کاغذی')).toBeInTheDocument()
  })

  it('draws the title, the scope line from the registries, and the statement', () => {
    draw(PAPER)
    expect(screen.getByRole('heading', { name: 'مانده شب فرنگی و برگر' })).toBeInTheDocument()
    expect(screen.getByText('آشپزخانه · چاله‌باغ')).toBeInTheDocument()
    expect(screen.getByText('بیان')).toBeInTheDocument()
    expect(screen.getByText('فرم کاغذی مانده شب بخش فرنگی.')).toBeInTheDocument()
    expect(screen.getByText('مانده شب')).toBeInTheDocument()
  })

  it('draws every orphan class of Appendix D, not only the tombstoned one', () => {
    draw(PAPER)
    // note 7 — the design draws `p.tomb` alone (:1723).
    expect(screen.getByText('اشاره به فرایند بازنشسته (جایگزین: cooking-007)')).toBeInTheDocument()
    expect(screen.getByText('ارجاع بی‌مقصد')).toBeInTheDocument()
    expect(screen.getByText('گرهٔ ارجاع‌شده حذف شده')).toBeInTheDocument()
  })

  it('renders a masked neighbour as «خارج از دسترسی شما», and never as a link', () => {
    draw(PAPER)
    const masked = screen.getAllByText('خارج از دسترسی شما')
    // One process link and one consumer chip.
    expect(masked).toHaveLength(2)
    for (const el of masked) expect(el.closest('button')).toBeNull()
  })

  it('puts the spreadsheet id in the footer chip and nowhere else — note 6', () => {
    draw(PAPER)
    const footer = screen.getByTestId('fact-footer')
    expect(within(footer).getByText('F-00011')).toBeInTheDocument()
    expect(within(footer).getByText('mande_shab')).toBeInTheDocument()
    expect(within(footer).getByText('15M2ovUmQ7kX3nR9pLwT2aB8cD4eF6gH1')).toBeInTheDocument()
  })

  it('draws no raw-JSON view — the owner refused it on 2026-08-31', () => {
    draw(PAPER)
    expect(screen.queryByText('نمای خام (فقط‌خواندنی)')).toBeNull()
  })

  it('draws the port and retired chips the design puts beside the kind', () => {
    draw(bundleOf('rule', { inputs: [], outputs: [], port: true }, {}, { retired: true }))
    expect(screen.getByText('باید عیناً در ERP پیاده شود')).toBeInTheDocument()
    expect(screen.getByText('بازنشسته')).toBeInTheDocument()
  })

  it('is a note’s statement and its sources, and no kind card at all', () => {
    draw(bundleOf('note', {}, {}, {
      id: 'F-00045', title: 'یادداشت', statement: 'استیک یخ‌زده برش می‌خورد.',
    }))
    expect(screen.getByText('بیان')).toBeInTheDocument()
    expect(screen.getByText('استیک یخ‌زده برش می‌خورد.')).toBeInTheDocument()
    expect(screen.getByText('منابع')).toBeInTheDocument()
    expect(screen.queryByText('ساختار و مکان جدول')).toBeNull()
    expect(screen.queryByText('چه چیزهایی لازم دارد')).toBeNull()
  })
})
