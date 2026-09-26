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

/** The backend registry (D26), the two rows it really serves today. */
const REPORTS = {
  reports: [
    { id: 'steps', name: 'دانلود گام‌به‌گام', short: 'راهنمای گام‌به‌گام',
      description: 'همان فرآیندها، بازنویسی‌شده به گام‌های شماره‌دار.' },
    { id: 'flowchart', name: 'دانلود فلوچارتی', short: 'مستندات کامل',
      description: 'هر فرآیند در یک برگ، به ترتیب سازمان‌یافتهٔ دپارتمان.' },
  ],
}

function draw(scopes: string[]) {
  const onChange = vi.fn()
  vi.stubGlobal('fetch', vi.fn(async (path: string) =>
    new Response(JSON.stringify(path === '/api/reports' ? REPORTS : DEPTS),
      { headers: { 'Content-Type': 'application/json' } })))
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

  it('widening drops every narrowing of the same department and touches no other', async () => {
    // The fixture used to hold `*` as well, which is a state no hand can reach
    // this control from: the grid is DISABLED while «کل سامانه» is on, so the
    // only route to a single department is to turn it off first (which leaves
    // nothing behind — see the two-step test below). `toggleDepartment` still
    // filters `*` out defensively; what is asserted here is what a person can do.
    //
    // **The widening act is «همهٔ گزارش‌ها» now, not the tile's tick** — owner
    // ruling. The tick answers "does this account reach this department at all",
    // which a report-scoped department already does, so pressing it here is a
    // subtraction (the test below). The wide grant is the popover's first row.
    const onChange = draw(['dept:dining/report:steps', 'dept:cashier'])
    await userEvent.click(await screen.findByRole('button', { name: 'نماهای سالن' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'همهٔ گزارش‌ها' }))
    expect(onChange).toHaveBeenCalledWith(['dept:cashier', 'dept:dining'])
  })

  it('the tile’s tick takes the department away in every shape it is held in', async () => {
    // Owner ruling: *"the checkbox near of department name is always on"* — the
    // tick follows the DEPARTMENT, so unticking it has to mean "this account no
    // longer reaches this department", not "drop the wide grant and leave the
    // narrowings standing". `toggleDepartment(code, false)` does the second, and
    // used on a report-scoped tile it would clear a grant that was not there and
    // leave the tile ticked, tinted and unchanged under the hand that pressed it.
    const onChange = draw(['dept:dining', 'dept:dining/report:steps', 'dept:cashier'])
    await userEvent.click(await screen.findByRole('checkbox', { name: 'سالن' }))
    expect(onChange).toHaveBeenCalledWith(['dept:cashier'])
  })

  it('never lets «همهٔ گزارش‌ها» and a single report be on together', async () => {
    // The other half of the ruling: *"we shouldn't have option the both of
    // checkbox (all report and each report) be on."* Neither direction is
    // enforced in the view — `toggleReport` drops the wide grant and
    // `toggleDepartment` drops every narrowing — so this asserts the grammar's
    // own exclusivity through the two controls that now express it.
    const onChange = draw(['dept:dining'])
    await userEvent.click(await screen.findByRole('button', { name: 'نماهای سالن' }))
    expect(screen.getByRole('checkbox', { name: 'همهٔ گزارش‌ها' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'راهنمای گام‌به‌گام' })).not.toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: 'راهنمای گام‌به‌گام' }))
    expect(onChange).toHaveBeenCalledWith(['dept:dining/report:steps'])
  })

  it('leaves nothing behind when «کل سامانه» comes off, so the grid opens empty', async () => {
    // The other half of the route above, and the reason the `*` filter in
    // `toggleDepartment` is belt-and-braces rather than the mechanism: turning
    // the wildcard off clears the draft outright rather than reviving whatever
    // was ticked before it — those boxes were cleared when it went on, and
    // bringing them back would grant departments nobody re-read.
    const onChange = draw(['*'])
    await userEvent.click(await screen.findByRole('checkbox', { name: 'کل سامانه' }))
    expect(onChange).toHaveBeenCalledWith([])
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

  it('makes the dimmed grid actually disabled — the keyboard reaches it too', async () => {
    // `opacity-40 pointer-events-none` stops the MOUSE. Every tick and every
    // views button in the grid stayed in the tab order, took focus and operated
    // normally from the keyboard while the whole region read as refused — R5's
    // shape inverted. Asserted through the keyboard rather than through a class
    // name, because the class is exactly what looked right.
    const onChange = draw(['*'])
    const dining = await screen.findByRole('checkbox', { name: 'سالن' })
    const views = screen.getByRole('button', { name: 'نماهای سالن' })
    expect(dining).toBeDisabled()
    expect(views).toBeDisabled()
    expect(screen.getByRole('group', { name: 'دپارتمان' })).toHaveAttribute('aria-disabled', 'true')

    // Tab from «کل سامانه» — the last control before the grid — must not land
    // inside it. `userEvent.tab()` walks the real tab order, so a control that
    // is merely dimmed is caught here and a `disabled` one is not reachable.
    screen.getByRole('checkbox', { name: 'کل سامانه' }).focus()
    await userEvent.tab()
    expect(screen.getByRole('group', { name: 'دپارتمان' })).not.toContainElement(
      document.activeElement as HTMLElement)

    // …and pressing it changes nothing, which is the half a tab-order check
    // alone would not cover for a mouse-less screen reader user.
    await userEvent.click(views)
    expect(screen.queryByRole('checkbox', { name: 'راهنمای گام‌به‌گام' })).toBeNull()
    await userEvent.click(dining)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('tints a tile the account reaches at all, and leaves the rest untinted', async () => {
    // §6.8's tile is `{on:--tile-v4 over --line-dashed | off:--card over --warm}`,
    // and "on" here has to mean "reaches this department", not "reaches the
    // whole of it": a report-scoped department painted exactly like an ungranted
    // one is the picture that made D11's «Report reader» read as an account with
    // no departments at all. The TICK says the same thing as of the owner's
    // ruling — *"the checkbox near of department name is always on"* — so the
    // two halves of the tile agree; which reports are reached is the popover's
    // question, and the tile states the narrowing in words below.
    draw(['dept:dining/report:steps'])
    const dining = (await screen.findByRole('checkbox', { name: 'سالن' })).closest('label')!
    const cashier = screen.getByRole('checkbox', { name: 'صندوق' }).closest('label')!
    expect(dining).toHaveClass('bg-tile-v4', 'border-line-dashed')
    expect(cashier).toHaveClass('bg-card', 'border-warm')
    expect(screen.getByRole('checkbox', { name: 'سالن' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'صندوق' })).not.toBeChecked()
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
    expect(within(grid).getByRole('checkbox', { name: 'سالن' })).toBeChecked()
    // …and it is legible without opening anything: the tile names the narrowing.
    expect(within(grid).getByText(/فقط راهنمای گام‌به‌گام/)).toBeInTheDocument()
    await userEvent.click(within(grid).getByRole('button', { name: 'نماهای سالن' }))
    expect(screen.getByRole('checkbox', { name: 'راهنمای گام‌به‌گام' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'مستندات کامل' })).not.toBeChecked()
    // …and the wide grant is off, which is what "only these reports" means.
    expect(screen.getByRole('checkbox', { name: 'همهٔ گزارش‌ها' })).not.toBeChecked()
  })

  it('takes the last report away without handing back the department it belonged to', async () => {
    // A subtraction can never be the thing that hands somebody more.
    const onChange = draw(['dept:dining/report:steps'])
    await userEvent.click(await screen.findByRole('button', { name: 'نماهای سالن' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'راهنمای گام‌به‌گام' }))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('says nothing and reads a report-scoped tile as held while /api/reports is still on its way, once /api/departments has already landed', async () => {
    // The two registries do not resolve together: `/api/departments` can land
    // well before `/api/reports` does. In that window `reportNames` is still
    // `{}`, and gating the notice on `departments.isPending` alone made a
    // purely report-scoped account — a perfectly ordinary one — flash
    // `UNDRAWABLE_SCOPES`, and its tile briefly read as unheld ("no access")
    // rather than tinted and ticked.
    let resolveReports: (r: Response) => void
    const reportsPromise = new Promise<Response>((resolve) => { resolveReports = resolve })
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path === '/api/reports') return reportsPromise
      return new Response(JSON.stringify(DEPTS), { headers: { 'Content-Type': 'application/json' } })
    }))
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ScopePicker scopes={['dept:dining/report:steps']} onChange={vi.fn()} />
      </QueryClientProvider>)

    // Departments have landed (the tile itself is drawn); reports have not.
    const dining = await screen.findByRole('checkbox', { name: 'سالن' })
    expect(dining).toBeChecked()
    expect(dining.closest('label')).toHaveClass('bg-tile-v4', 'border-line-dashed')
    expect(screen.queryByText(/این دامنه‌ها را این فرم نمی‌تواند نشان دهد/)).toBeNull()

    // …and once the registry lands, the state is unchanged (still held, still
    // no notice) — this window was never a real state, just a slow read.
    resolveReports!(new Response(JSON.stringify({
      reports: [{ id: 'steps', name: 'راهنمای گام‌به‌گام', short: 'راهنمای گام‌به‌گام', description: '' }],
    }), { headers: { 'Content-Type': 'application/json' } }))
    await screen.findByText(/فقط راهنمای گام‌به‌گام/)
    expect(dining).toBeChecked()
    expect(screen.queryByText(/این دامنه‌ها را این فرم نمی‌تواند نشان دهد/)).toBeNull()
  })

  it('never draws a tile held and calls the same scope undrawable at once', async () => {
    // The regression the pending-window fix above nearly introduced: a raw
    // `startsWith('dept:x/report:')` test would count `dept:dining/report:bogus`
    // as held forever, including once the registry HAS arrived and names it
    // undrawable — the tile ticked and tinted while the notice below, in the
    // same render, lists that very scope as one this form cannot draw. `held`
    // has to answer the same question `undrawable` does: once the registry is
    // in, only a report id the registry actually names counts.
    draw(['dept:dining/report:bogus'])
    const dining = await screen.findByRole('checkbox', { name: 'سالن' })
    expect(dining).not.toBeChecked()
    expect(dining.closest('label')).toHaveClass('bg-card', 'border-warm')
    expect(await screen.findByText(/این دامنه‌ها را این فرم نمی‌تواند نشان دهد/))
      .toHaveTextContent('سالن/report:bogus')
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
