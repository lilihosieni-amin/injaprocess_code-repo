import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ScopePicker } from './ScopePicker'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const DEPTS = [
  { code: 'dining', name: 'سالن', count: 0, subs: 0 },
  { code: 'cashier', name: 'صندوق', count: 0, subs: 0 },
]

function draw(scopes: string[]) {
  const onChange = vi.fn()
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify(DEPTS), { headers: { 'Content-Type': 'application/json' } })))
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ScopePicker scopes={scopes} onChange={onChange} />
    </QueryClientProvider>)
  return onChange
}

describe('ScopePicker', () => {
  it('draws one tile per department, not three checkboxes per department', async () => {
    // The whole reason the dialog was 2207px tall: the grammar has three shapes
    // and the old fieldset gave every one of them a stacked 44px row —
    // 1 + 9 + 18 = 28 of them, ~80% of the box. §6.8 expresses the same three in
    // a 2-column grid of nine tiles with the report level behind a per-tile
    // popover.
    draw([])
    await screen.findByRole('checkbox', { name: 'سالن' })
    const grid = screen.getByRole('group', { name: 'دپارتمان' })
    expect(within(grid).getAllByRole('checkbox')).toHaveLength(2)
    expect(within(grid).getByRole('checkbox', { name: 'سالن' })).toBeInTheDocument()
  })

  it('widening removes `*` and every narrowing of the same department', async () => {
    const onChange = draw(['*', 'dept:dining/report:steps'])
    await userEvent.click(await screen.findByRole('checkbox', { name: 'سالن' }))
    expect(onChange).toHaveBeenCalledWith(['dept:dining'])
  })

  it('a report drops the whole-department grant and keeps its siblings', async () => {
    const onChange = draw(['dept:dining', 'dept:dining/report:flowchart'])
    await userEvent.click(await screen.findByRole('button', { name: 'نماهای سالن' }))
    await userEvent.click(await screen.findByRole('checkbox', { name: 'راهنمای گام‌به‌گام' }))
    expect(onChange).toHaveBeenCalledWith(
      ['dept:dining/report:flowchart', 'dept:dining/report:steps'])
  })

  it('«کل سامانه» clears the tiles and dims the grid rather than hiding it', async () => {
    const onChange = draw(['dept:dining'])
    await userEvent.click(await screen.findByRole('checkbox', { name: 'کل سامانه' }))
    expect(onChange).toHaveBeenCalledWith(['*'])
    // **Both halves**, because one alone is satisfied by a grid that is always
    // dimmed — a same-value ternary is a shipped defect here (ledger L-32) and
    // it renders every ordinary account's departments at 40% opacity.
    expect(screen.getByRole('group', { name: 'دپارتمان' }))
      .toHaveAttribute('data-dimmed', 'false')
    // R5's neighbour: §6.8 dims the grid by opacity when "whole system" is on.
    // Hidden, an administrator cannot see what they are about to widen past.
    draw(['*'])
    expect((await screen.findAllByRole('group', { name: 'دپارتمان' }))[1])
      .toHaveAttribute('data-dimmed', 'true')
  })

  it('tints a tile the account reaches at all, and leaves the rest untinted', async () => {
    // §6.8's tile is `{on:--tile-v4 over --line-dashed | off:--card over --warm}`,
    // and "on" here has to mean "reaches this department", not "reaches the
    // whole of it": a report-scoped department painted exactly like an ungranted
    // one is the picture that made D11's «Report reader» read as an account with
    // no departments at all. The TICK still says whole-or-not — drawn ticked,
    // the tile would report more reach than the account holds.
    draw(['dept:dining/report:steps'])
    const dining = (await screen.findByRole('checkbox', { name: 'سالن' })).closest('label')!
    const cashier = screen.getByRole('checkbox', { name: 'صندوق' }).closest('label')!
    expect(dining).toHaveClass('bg-tile-v4', 'border-line-dashed')
    expect(cashier).toHaveClass('bg-card', 'border-warm')
    expect(screen.getByRole('checkbox', { name: 'سالن' })).not.toBeChecked()
  })

  it('keeps a scope it can draw no control for, and says so', async () => {
    draw(['dept:gone', 'nonsense'])
    expect(await screen.findByText(/این دامنه‌ها را این فرم نمی‌تواند نشان دهد/))
      .toBeInTheDocument()
  })

  it('offers the report level of a department it holds no whole grant of', async () => {
    // **D11's «Report reader», and the reason §6.8's "a views button when the
    // tile is on" cannot be taken literally here.** A tile drawn off, with the
    // views affordance withheld until it is ticked, makes an account holding
    // `dept:dining/report:steps` unreadable and unreachable: the only way to its
    // own grant would be to tick the whole department first — granting, for a
    // moment, everything the narrowing exists to withhold.
    draw(['dept:dining/report:steps'])
    await screen.findByRole('checkbox', { name: 'سالن' })
    const grid = screen.getByRole('group', { name: 'دپارتمان' })
    expect(within(grid).getByRole('checkbox', { name: 'سالن' })).not.toBeChecked()
    // …and it is legible without opening anything: the tile names the narrowing.
    expect(within(grid).getByText(/فقط راهنمای گام‌به‌گام/)).toBeInTheDocument()
    await userEvent.click(within(grid).getByRole('button', { name: 'نماهای سالن' }))
    expect(screen.getByRole('checkbox', { name: 'راهنمای گام‌به‌گام' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'مستندات کامل' })).not.toBeChecked()
  })

  it('takes the last report away without handing back the department it belonged to', async () => {
    // A subtraction can never be the thing that hands somebody more.
    const onChange = draw(['dept:dining/report:steps'])
    await userEvent.click(await screen.findByRole('button', { name: 'نماهای سالن' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'راهنمای گام‌به‌گام' }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('says nothing about undrawable scopes while the registry is still on its way', async () => {
    // In flight, EVERY department scope is one this form draws no control for,
    // so a notice gated on `data === undefined` flashes across a perfectly
    // ordinary account on every open. A read that FAILED has the same undefined
    // data and the opposite meaning.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ScopePicker scopes={['dept:dining']} onChange={vi.fn()} />
      </QueryClientProvider>)
    expect(await screen.findByRole('checkbox', { name: 'کل سامانه' })).toBeInTheDocument()
    expect(screen.queryByText(/این دامنه‌ها را این فرم نمی‌تواند نشان دهد/)).toBeNull()
  })
})
