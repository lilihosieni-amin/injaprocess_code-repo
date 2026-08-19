import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfirmMark, ConfirmAction } from './ConfirmMark'
import type { Confirmation } from '../api/types'
import type { SessionDescriptor } from '../auth/session'

vi.mock('../auth/useSession', () => ({ useSession: () => ({ data: session }) }))

let session: SessionDescriptor | undefined

const EDITOR: SessionDescriptor = {
  username: '09120000000', displayName: 'و', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers',
                 'view_audit', 'edit', 'confirm', 'set_visibility'],
  scopes: ['dept:dining'], supervisor: null, canSupervise: false,
  pendingApprovals: 0,
}
const READER: SessionDescriptor = {
  username: '09120000001', displayName: 'خ', role: 'reader',
  capabilities: ['view', 'comment', 'export_pdf'], scopes: ['dept:dining'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}
/** Holds `confirm` — over another department. Separates "may this person confirm
 *  anything?" from "may they confirm THIS department?", which is the question
 *  `_target_scope` asks on the server and therefore the only one worth drawing
 *  from. */
const OTHER_DEPT_EDITOR: SessionDescriptor = { ...EDITOR, scopes: ['dept:cooking'] }

const CONFIRMED: Confirmation = {
  target: 'dining-001', kind: 'process', fingerprint: 'a'.repeat(64),
  confirmed: true, confirmed_by: '09120000000', confirmed_at: 1770000000,
}
const UNCONFIRMED: Confirmation = { ...CONFIRMED, confirmed: false,
  confirmed_by: null, confirmed_at: null }

function mount(row: Confirmation | undefined, who: SessionDescriptor | undefined) {
  session = who
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ConfirmMark row={row} department="dining" />
    </QueryClientProvider>,
  )
}

/** A `fetch` double that answers one status and one JSON body, and records every
 *  call so the request itself — not only what was drawn afterwards — can be
 *  asserted. `fetchJson` reads `detail` off an error body, which is where the
 *  409's Persian message would come from if the component echoed it. */
function mockFetch(status: number, body: unknown) {
  // Typed on the signature rather than inferred from the implementation:
  // inferred from `async () => …` the recorded arguments are the **empty
  // tuple**, so `spy.mock.calls[0][0]` is a type error `tsc` catches and
  // vitest — which never typechecks — does not. Three bugs in an earlier
  // sub-project were visible only to a real build for the same reason.
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' },
    }))
  vi.stubGlobal('fetch', spy)
  return spy
}

/** A `fetch` double that never answers, so the request stays in flight for the
 *  length of the test. The only way to observe the busy state at all: a resolved
 *  promise flips `isPending` back before any assertion can run. */
function stalledFetch() {
  const spy = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    () => new Promise<Response>(() => {}))
  vi.stubGlobal('fetch', spy)
  return spy
}

/** A client whose `invalidateQueries` calls are recorded, then run for real. */
function recordingClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidated: unknown[][] = []
  const real = qc.invalidateQueries.bind(qc)
  vi.spyOn(qc, 'invalidateQueries').mockImplementation((filters) => {
    invalidated.push((filters as { queryKey?: unknown[] } | undefined)?.queryKey ?? [])
    return real(filters)
  })
  return { qc, invalidated }
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('ConfirmMark', () => {
  it('says a process is unconfirmed, and offers no act of its own', () => {
    mount(UNCONFIRMED, EDITOR)
    expect(screen.getByText('تأیید نشده')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says a process is confirmed, and still offers no act', () => {
    mount(CONFIRMED, EDITOR)
    expect(screen.getByText('تأیید شده')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('draws nothing at all for someone who cannot confirm', () => {
    // Not a disabled button and not a greyed mark: a reader only ever sees
    // confirmed content, so a mark would say something that is true of
    // everything they can see and therefore says nothing. The server refuses
    // regardless (D48) — this is about not drawing a control nobody can use.
    const { container } = mount(UNCONFIRMED, READER)
    expect(container).toBeEmptyDOMElement()
  })

  it('draws nothing for a holder of confirm scoped to another department', () => {
    const { container } = mount(UNCONFIRMED, OTHER_DEPT_EDITOR)
    expect(container).toBeEmptyDOMElement()
  })

  it('draws nothing while the row has not arrived', () => {
    const { container } = mount(undefined, EDITOR)
    expect(container).toBeEmptyDOMElement()
  })
})

/** One `ConfirmAction`, and a `rerender` that swaps only the row.
 *
 *  Rendered through a helper that keeps ONE `QueryClient` across the rerender:
 *  a fresh client would drop the mutation whose 409 the "stops saying it" pair
 *  is about, and both halves would pass for the wrong reason. */
function actionView(row: Confirmation | undefined, qc: QueryClient) {
  return (
    <QueryClientProvider client={qc}>
      <ConfirmAction row={row} department="dining" />
    </QueryClientProvider>
  )
}

function drawAction(row: Confirmation | undefined,
  who: SessionDescriptor | undefined = EDITOR) {
  session = who
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(actionView(row, qc))
  return {
    ...view,
    qc,
    rerender: (next: Confirmation | undefined) => view.rerender(actionView(next, qc)),
  }
}

/** Open the dialog and press its own OK. Two presses, and that is the point:
 *  FR-I3 says nothing is written until the editor asks for it a second time. */
function press(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }))
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: label }))
  return dialog
}

describe('ConfirmAction — who is offered the act at all', () => {
  it('draws nothing at all for someone who cannot confirm', () => {
    // R5 / D22 — not a disabled button and not a greyed control: a reader only
    // ever sees confirmed content, so the act would be an affordance nobody in
    // that role can use. The server refuses regardless (D48).
    const { container } = drawAction(UNCONFIRMED, READER)
    expect(container).toBeEmptyDOMElement()
  })

  it('draws nothing for a holder of confirm scoped to another department', () => {
    const { container } = drawAction(UNCONFIRMED, OTHER_DEPT_EDITOR)
    expect(container).toBeEmptyDOMElement()
  })

  it('draws nothing while the row has not arrived', () => {
    const { container } = drawAction(undefined, EDITOR)
    expect(container).toBeEmptyDOMElement()
  })

  it('offers the withdrawal, and only that, once the row is confirmed', () => {
    drawAction(CONFIRMED, EDITOR)
    expect(screen.getByRole('button', { name: 'لغو تأیید' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تأیید محتوا' })).toBeNull()
  })
})

describe('ConfirmAction — nothing is written until the editor asks twice', () => {
  it('confirms behind the design’s confirm-content dialog', async () => {
    const spy = mockFetch(200, { ...UNCONFIRMED, confirmed: true })
    drawAction(UNCONFIRMED)
    fireEvent.click(screen.getByRole('button', { name: 'تأیید محتوا' }))
    const dialog = await screen.findByRole('dialog', { name: /تأیید محتوا/ })
    // §6.15 `confirmDialog` — a 42x42 radius-14 tinted glyph tile beside the
    // title; OK filled `--green` confirming, `--coral` un-confirming
    // (`Inja Panel.dc.html:3601`, `:3603`).
    expect(within(dialog).getByTestId('confirm-glyph'))
      .toHaveClass('bg-tile-ok', 'text-green')
    // FR-I3 — opening the box writes nothing. The mutation goes out on the
    // second press and not before.
    expect(spy).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'تأیید محتوا' }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    // The fingerprint comes from the server and goes straight back: the client
    // computes none, because canonical JSON here would have to agree with
    // Python's byte for byte over Persian text.
    const [url, init] = spy.mock.calls[0]
    expect(url).toBe('/api/confirmations/dining-001')
    expect(JSON.parse(String(init?.body))).toEqual({ fingerprint: 'a'.repeat(64) })
  })

  it('writes nothing at all when the dialog is dismissed instead', async () => {
    // The other half of FR-I3, and the half a "fire on open" regression would
    // leave green: cancelling must leave the document exactly as it was.
    const spy = mockFetch(200, { ...UNCONFIRMED, confirmed: true })
    drawAction(UNCONFIRMED)
    fireEvent.click(screen.getByRole('button', { name: 'تأیید محتوا' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'انصراف' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(spy).not.toHaveBeenCalled()
  })

  it('draws the un-confirming dialog in the conflict tone', async () => {
    mockFetch(200, UNCONFIRMED)
    drawAction(CONFIRMED)
    fireEvent.click(screen.getByRole('button', { name: 'لغو تأیید' }))
    const dialog = await screen.findByRole('dialog', { name: /لغو تأیید/ })
    expect(within(dialog).getByTestId('confirm-glyph'))
      .toHaveClass('bg-tile-c', 'text-conflict')
  })

  it('states FR-V2’s rule where the editor is deciding, in the deliverable’s own words', async () => {
    // `Inja Panel.dc.html:3599` — the confirm-content dialog's own note. A
    // confirmation is for a VERSION, and this is the one place the product says
    // so to the person it binds (FR-V2 / FR-V3 / AC-18).
    mockFetch(200, { ...UNCONFIRMED, confirmed: true })
    drawAction(UNCONFIRMED)
    fireEvent.click(screen.getByRole('button', { name: 'تأیید محتوا' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/جابه‌جایی گره‌ها/)).toBeInTheDocument()
    expect(within(dialog).getByText(/تأیید را باطل می‌کند/)).toBeInTheDocument()
  })

  it('is a 44px hit target drawn at the design’s 34px', () => {
    drawAction(UNCONFIRMED)
    const button = screen.getByRole('button', { name: 'تأیید محتوا' })
    expect(button).toHaveClass('min-h-touch', 'min-w-touch')
    expect(within(button).getByTestId('confirm-box')).toHaveClass('w-tool', 'h-tool')
  })

  it('is not a control that can set the height of a title line', () => {
    // The F1 defect one property along: `ConfirmMark` is what a title row
    // carries, and it must stay free of the 44px floor even though the act it
    // used to hold now has one.
    drawMark({ confirmed: false })
    const mark = screen.getByTestId('confirm-mark')
    expect(within(mark).queryByTestId('confirm-box')).toBeNull()
  })
})

describe('ConfirmAction — the fingerprint goes back exactly as it came', () => {
  it('confirms the target named by the row, never the department it was drawn in', async () => {
    // `department` is the scope the capability is asked about; `row.target` is
    // what is confirmed. A process control drawn on a department page must
    // still POST to the process.
    const spy = mockFetch(200, { ...UNCONFIRMED, confirmed: true })
    drawAction({ ...UNCONFIRMED, target: 'dining-007' })
    press('تأیید محتوا')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy.mock.calls[0][0]).toBe('/api/confirmations/dining-007')
  })

  it('withdraws with a DELETE that carries no fingerprint at all', async () => {
    // Withdrawal says "whatever is there is wrong", which does not depend on
    // which version it was: the server takes no body, and requiring one would
    // refuse the withdrawal precisely when the document has drifted.
    const spy = mockFetch(200, UNCONFIRMED)
    drawAction(CONFIRMED)
    press('لغو تأیید')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const [url, init] = spy.mock.calls[0]
    expect(url).toBe('/api/confirmations/dining-001')
    expect(init?.method).toBe('DELETE')
    expect(init?.body).toBeUndefined()
  })

  it('closes the dialog once the write lands', async () => {
    const spy = mockFetch(200, { ...UNCONFIRMED, confirmed: true })
    drawAction(UNCONFIRMED)
    press('تأیید محتوا')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('ConfirmAction — a 409 is not a failure, it is “look again”', () => {
  it('says the content moved, and does not say the request failed', async () => {
    const spy = mockFetch(409, {
      detail: 'این محتوا از زمانی که آن را دیدید تغییر کرده است؛'
              + ' دوباره بررسی و تأیید کنید.',
    })
    drawAction(UNCONFIRMED)
    press('تأیید محتوا')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    // On the **role**, not on the text. A message that appears after the click
    // that caused it reaches a screen reader only if it is announced, and
    // `role="alert"` is the whole of that announcement — jsdom implements no
    // live region, so deleting the attribute changes nothing a `findByText`
    // could see and the one property this surface was chosen for would be
    // asserted nowhere.
    expect(await screen.findByRole('alert')).toHaveTextContent(/تغییر کرده است/)
    // The generic copy must be absent, not merely also present: 409 is the
    // server's settled answer that the document moved, and reporting it as
    // "it didn't work, try again" tells the editor to retry the very thing
    // that will keep being refused.
    expect(screen.queryByText(/دوباره تلاش کنید/)).toBeNull()
    // …and it is inside the dialog, never back in the row that opened it (F3).
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toBeInTheDocument()
  })

  it('keeps the dialog open on a 409, so the sentence has somewhere to be', async () => {
    const spy = mockFetch(409, { detail: 'تغییر کرده است' })
    drawAction(UNCONFIRMED)
    press('تأیید محتوا')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    await screen.findByRole('alert')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('refetches the row after a 409, so the stale fingerprint on screen is replaced', async () => {
    // The screen is stale by definition when a 409 lands — the fingerprint it
    // holds is not the document's. Without this the editor is told to look
    // again at exactly the bytes that were already refused, forever.
    const spy = mockFetch(409, { detail: 'تغییر کرده است' })
    session = EDITOR
    const { qc, invalidated } = recordingClient()
    render(actionView(UNCONFIRMED, qc))
    press('تأیید محتوا')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    await waitFor(() =>
      expect(invalidated).toContainEqual(['confirmations', 'dining']))
  })

  it('takes the “look again” message away once the fresh row arrives', async () => {
    // `onSettled` refetches the listing, so a row with a *new* fingerprint lands
    // moments after the 409 — and the complaint stops being true. Left standing
    // it sits beside an up-to-date row telling the editor to look again at the
    // very thing they are now looking at, cleared only by the next click.
    const spy = mockFetch(409, { detail: 'تغییر کرده است' })
    const { rerender } = drawAction(UNCONFIRMED)
    press('تأیید محتوا')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(await screen.findByRole('alert')).toHaveTextContent(/تغییر کرده است/)
    // What the refetch produces: the same target, a fingerprint that moved.
    rerender({ ...UNCONFIRMED, fingerprint: 'f'.repeat(64) })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the message while the row on screen is still the one that was refused', async () => {
    // The other half of the rule above, and the half a "just stop rendering it"
    // fix would silently break: a re-render that does not carry a new
    // fingerprint has not answered the 409, so the message must stay.
    const spy = mockFetch(409, { detail: 'تغییر کرده است' })
    const { rerender } = drawAction(UNCONFIRMED)
    press('تأیید محتوا')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(await screen.findByRole('alert')).toHaveTextContent(/تغییر کرده است/)
    rerender({ ...UNCONFIRMED })
    expect(screen.getByRole('alert')).toHaveTextContent(/تغییر کرده است/)
  })

  it('reports anything that is not a 409 as a plain failure', async () => {
    const spy = mockFetch(500, { detail: 'boom' })
    drawAction(UNCONFIRMED)
    press('تأیید محتوا')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(await screen.findByRole('alert')).toHaveTextContent(/دوباره تلاش کنید/)
    expect(screen.queryByText(/تغییر کرده است/)).toBeNull()
  })

  it('says a failed withdrawal failed — the DELETE has an error surface of its own', async () => {
    // Every case above presses «تأیید محتوا», so `failure = set.error` alone
    // passes all of them: a DELETE that 5xx'd would leave the editor watching a
    // button that did nothing and said nothing about it.
    const spy = mockFetch(500, { detail: 'boom' })
    drawAction(CONFIRMED)
    press('لغو تأیید')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(await screen.findByRole('alert')).toHaveTextContent(/دوباره تلاش کنید/)
  })

  it('reports a 403 as settled too, not as something to try again', async () => {
    // `set_confirmation` answers 403 for a tombstoned target, and `requires`
    // answers it for a role that has stopped holding `confirm`. Both are the
    // server's final word, and both used to arrive as «دوباره تلاش کنید» — the
    // exact "settled refusal reported as retryable" the 409 branch exists to
    // prevent. Reachable whenever the listing on screen predates the change: a
    // pipeline `merge` run tombstones outside this app entirely, so no client
    // invalidation can close it.
    const spy = mockFetch(403, { detail: 'این فرآیند حذف شده و دیگر قابل تأیید نیست' })
    drawAction(UNCONFIRMED)
    press('تأیید محتوا')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(await screen.findByRole('alert')).toHaveTextContent(/صفحه را تازه کنید/)
    expect(screen.queryByText(/دوباره تلاش کنید/)).toBeNull()
    expect(screen.queryByText(/تغییر کرده است/)).toBeNull()
  })

  it('refetches the list after a confirmation lands, so the mark is not stale', async () => {
    const spy = mockFetch(200, { ...UNCONFIRMED, confirmed: true })
    session = EDITOR
    const { qc, invalidated } = recordingClient()
    render(actionView(UNCONFIRMED, qc))
    press('تأیید محتوا')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    // The department board's counts move with a confirmation for every reader,
    // so both keys have to go.
    await waitFor(() => {
      expect(invalidated).toContainEqual(['confirmations', 'dining'])
      expect(invalidated).toContainEqual(['departments'])
    })
  })

  it('refetches the list after a withdrawal too', async () => {
    const spy = mockFetch(200, UNCONFIRMED)
    session = EDITOR
    const { qc, invalidated } = recordingClient()
    render(actionView(CONFIRMED, qc))
    press('لغو تأیید')
    await waitFor(() => expect(spy).toHaveBeenCalled())
    await waitFor(() => {
      expect(invalidated).toContainEqual(['confirmations', 'dining'])
      expect(invalidated).toContainEqual(['departments'])
    })
  })
})

describe('ConfirmAction — a request in flight looks like one', () => {
  it('goes busy while the confirmation is in flight, and refuses the second click', async () => {
    // `Button` implements the disable-while-loading itself and `primitives.test`
    // pins that. What is pinned here is that this call site *wires* it: strip
    // `loading`/`loadingLabel` from the dialog's OK and every other test in this
    // file still passes, so the double-submit guard could be dropped invisibly.
    const spy = stalledFetch()
    drawAction(UNCONFIRMED)
    press('تأیید محتوا')
    const busy = await screen.findByRole('button', { name: 'در حال ثبت…' })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(busy)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('goes busy while the withdrawal is in flight too', async () => {
    const spy = stalledFetch()
    drawAction(CONFIRMED)
    press('لغو تأیید')
    const busy = await screen.findByRole('button', { name: 'در حال ثبت…' })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(busy)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('ConfirmMark — who vouched, and when', () => {
  it('names the confirming editor and the Jalali date', () => {
    // confirmed_at is unix **seconds** (the server writes int(time.time())), so
    // it is not an ISO string and must not be handed to jalali as one:
    // 1770000000 is 2026-02-02, i.e. ۱۴۰۴/۱۱/۱۳. Passing the raw number would
    // print ۱۳۴۸/۱۱/۰۱, five decades off, and no assertion on "some date
    // appeared" would notice.
    mount(CONFIRMED, EDITOR)
    expect(screen.getByText(/توسط/)).toBeInTheDocument()
    expect(screen.getByText(/۰۹۱۲۰۰۰۰۰۰۰/)).toBeInTheDocument()
    expect(screen.getByText(/۱۴۰۴\/۱۱\/۱۳/)).toBeInTheDocument()
    expect(screen.queryByText(/۱۳۴۸/)).toBeNull()
  })

  it('says nothing about who or when while nobody has vouched', () => {
    // `confirmed_by` and `confirmed_at` are null on an unconfirmed row, and a
    // «توسط » with nothing after it is worse than no line.
    mount(UNCONFIRMED, EDITOR)
    expect(screen.queryByText(/توسط/)).toBeNull()
  })

  it('says nothing about who or when when the row is confirmed but the two are null', () => {
    // Defensive, and not hypothetical: `_row` only fills the pair when the
    // stored fingerprint still matches, and this component must not render
    // «توسط null» if that invariant ever slips.
    mount({ ...CONFIRMED, confirmed_by: null, confirmed_at: null }, EDITOR)
    expect(screen.getByText('تأیید شده')).toBeInTheDocument()
    expect(screen.queryByText(/توسط/)).toBeNull()
    expect(screen.queryByText(/null/)).toBeNull()
    expect(screen.queryByText(/NaN/)).toBeNull()
  })
})

/** One `ConfirmMark`, drawn from the two facts a row carries. */
function drawMark(
  o: { confirmed: boolean; by?: string | null; at?: number | null } = { confirmed: false },
  who: SessionDescriptor | undefined = EDITOR,
) {
  return mount({ ...CONFIRMED, confirmed: o.confirmed,
    confirmed_by: o.by ?? null, confirmed_at: o.at ?? null }, who)
}

describe('the mark states, and the action acts (F1, F2, F3)', () => {
  it('renders a pill and nothing that can force a row taller', () => {
    drawMark({ confirmed: true })
    const mark = screen.getByTestId('confirm-mark')
    // F1 — `Button`'s BASE is `min-h-touch min-w-touch` = 44x44. Dropped into a
    // title line built from an 11px id badge, a 15px name and a 10.5px tag —
    // natural height ~22px — it set the height of every row on the list.
    expect(within(mark).queryAllByRole('button')).toHaveLength(0)
    expect(mark.querySelector('.min-h-touch')).toBeNull()
    expect(within(mark).getByText('تأیید شده')).toBeInTheDocument()
  })

  it('keeps the failure sentence out of the title row (F3)', () => {
    // MOVED is 62 Persian characters. On a 920px row already carrying a badge,
    // a name, a tag, a pill and a button, it had nowhere to go but a second
    // line — so the row silently doubled and pushed every row below it down.
    // The mark performs no act at all now, so it can hold no failure of its own.
    drawMark({ confirmed: false })
    expect(within(screen.getByTestId('confirm-mark')).queryByRole('alert')).toBeNull()
  })

  it('gives the byline a colour somebody can read on the field it is drawn on (F4)', () => {
    // **Not `text-muted`, and this is a correction to the brief.** F4 measured
    // `--text-faint #a99fc4` against CREAM (2.27:1) — but neither call site is
    // on cream: `Summary` puts this mark in its badge row and `Overview` beside
    // its H1, and both of those roots are `bg-ink`, the #2A1D5E field. Against
    // the field the numbers invert — faint is 5.88:1 and `--text-muted #8a7db0`
    // is 3.93:1 — so the prescribed fix would have LOWERED the contrast at both
    // real call sites. `--role-subtitle-on-field` (#C9BEEE, ledger L-28) is the
    // decided role for secondary copy on the field and measures 8.6:1.
    drawMark({ confirmed: true, by: '09120000000', at: 1753000000 })
    expect(screen.getByTestId('confirm-by')).toHaveClass('text-role-subtitle-on-field')
    expect(screen.getByTestId('confirm-by')).not.toHaveClass('text-faint')
  })
})
