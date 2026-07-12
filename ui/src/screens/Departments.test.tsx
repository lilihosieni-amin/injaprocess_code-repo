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
})
