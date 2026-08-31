import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SourceRow } from './SourceRow'

/**
 * QF-39 — the Panel does not render evidence. Every file-backed source row is a
 * press that opens one confirmation popup and then downloads the file; a
 * `process` row navigates; a `chat` row is inert.
 */

const clicked: string[] = []
let spy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  clicked.length = 0
  spy = vi.spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this.href) })
})
afterEach(() => { spy.mockRestore() })

const SHEET = {
  type: 'sheet' as const,
  ref: 'attachments/sheets/MandeShab__Mavade Avalie/Mavade Avalie.xlsx',
  sheet: 'پیتزا ایتالیایی', cell: 'B1',
}

describe('a source row', () => {
  it('names the source in Persian and shows where in the file it was read', () => {
    render(<SourceRow source={SHEET} />)
    expect(screen.getByText('کاربرگ')).toBeInTheDocument()
    expect(screen.getByText('برگهٔ پیتزا ایتالیایی، خانهٔ B1')).toBeInTheDocument()
    // The row shows the file's own name, not the whole stored path (:4806).
    expect(screen.getByText('Mavade Avalie.xlsx')).toBeInTheDocument()
  })

  it('asks before it downloads, and names the file in the question', async () => {
    const user = userEvent.setup()
    render(<SourceRow source={SHEET} />)
    await user.click(screen.getByRole('button', { name: /Mavade Avalie\.xlsx/ }))
    expect(screen.getByRole('dialog', { name: 'فایل منبع دانلود شود؟' }))
      .toHaveTextContent('Mavade Avalie.xlsx')
    // Nothing has been fetched by opening the question (FR-I3).
    expect(clicked).toEqual([])
  })

  it('downloads through the gated route, with the stored path as the query', async () => {
    const user = userEvent.setup()
    render(<SourceRow source={SHEET} />)
    await user.click(screen.getByRole('button', { name: /Mavade Avalie\.xlsx/ }))
    await user.click(screen.getByRole('button', { name: 'دانلود' }))
    expect(clicked).toHaveLength(1)
    expect(clicked[0]).toContain(`/api/facts/source?path=${encodeURIComponent(SHEET.ref)}`)
    // …and the question is gone, so a second press is a second decision.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('downloads nothing when the question is answered «انصراف»', async () => {
    const user = userEvent.setup()
    render(<SourceRow source={SHEET} />)
    await user.click(screen.getByRole('button', { name: /Mavade Avalie\.xlsx/ }))
    await user.click(screen.getByRole('button', { name: 'انصراف' }))
    expect(clicked).toEqual([])
  })

  it('navigates on a `process` source and never offers a download', async () => {
    const user = userEvent.setup()
    const onOpenProcess = vi.fn()
    render(<SourceRow
      source={{ type: 'process', ref: 'departments/cooking/processes/cooking-001.json',
        node: 'cooking-001-n010' }}
      onOpenProcess={onOpenProcess} />)
    await user.click(screen.getByRole('button', { name: /cooking-001/ }))
    expect(onOpenProcess).toHaveBeenCalledWith('cooking-001')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('leaves a `chat` source inert — QF-39 says so of the TYPE, not of the ref', () => {
    // With a `ref`, so the clause under test is the type and not the absence of
    // a file: a `chat` row is inert whatever the envelope happens to carry.
    render(<SourceRow source={{ type: 'chat', ref: 'runs/chat/20260901-101500' }} />)
    expect(screen.getByText('گفتگو')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('leaves a `chat` source with no file at all inert too', () => {
    render(<SourceRow source={{ type: 'chat', ref: null }} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
