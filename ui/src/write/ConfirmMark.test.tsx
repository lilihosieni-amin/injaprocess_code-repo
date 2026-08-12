import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfirmMark } from './ConfirmMark'
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

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('ConfirmMark', () => {
  it('says a process is unconfirmed, and says who cannot see it', () => {
    mount(UNCONFIRMED, EDITOR)
    expect(screen.getByText('تأیید نشده')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'تأیید محتوا' })).toBeInTheDocument()
  })

  it('says a process is confirmed and offers the withdrawal', () => {
    mount(CONFIRMED, EDITOR)
    expect(screen.getByText('تأیید شده')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'لغو تأیید' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تأیید محتوا' })).toBeNull()
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

describe('ConfirmMark — the fingerprint goes back exactly as it came', () => {
  it('POSTs the row’s own fingerprint to the row’s own target', async () => {
    // The whole point of storing a fingerprint rather than a boolean: what is
    // vouched for is the bytes this row describes. A mutation that sent no
    // fingerprint, or one from anywhere else, would confirm a document nobody
    // read — and the server, which compares against the file on disk, is the
    // only thing that could ever notice.
    const spy = mockFetch(200, { ...UNCONFIRMED, confirmed: true })
    mount(UNCONFIRMED, EDITOR)
    fireEvent.click(screen.getByRole('button', { name: 'تأیید محتوا' }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const [url, init] = spy.mock.calls[0]
    expect(url).toBe('/api/confirmations/dining-001')
    expect(init?.method).toBe('POST')
    expect(JSON.parse(String(init?.body))).toEqual({ fingerprint: 'a'.repeat(64) })
  })

  it('confirms the target named by the row, never the department it was drawn in', async () => {
    // `department` is the scope the capability is asked about; `row.target` is
    // what is confirmed. A process mark drawn on the department page must still
    // POST to the process.
    const spy = mockFetch(200, { ...UNCONFIRMED, confirmed: true })
    mount({ ...UNCONFIRMED, target: 'dining-007' }, EDITOR)
    fireEvent.click(screen.getByRole('button', { name: 'تأیید محتوا' }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy.mock.calls[0][0]).toBe('/api/confirmations/dining-007')
  })

  it('withdraws with a DELETE that carries no fingerprint at all', async () => {
    // Withdrawal says "whatever is there is wrong", which does not depend on
    // which version it was: the server takes no body, and requiring one would
    // refuse the withdrawal precisely when the document has drifted.
    const spy = mockFetch(200, UNCONFIRMED)
    mount(CONFIRMED, EDITOR)
    fireEvent.click(screen.getByRole('button', { name: 'لغو تأیید' }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const [url, init] = spy.mock.calls[0]
    expect(url).toBe('/api/confirmations/dining-001')
    expect(init?.method).toBe('DELETE')
    expect(init?.body).toBeUndefined()
  })
})

describe('ConfirmMark — a 409 is not a failure, it is “look again”', () => {
  it('says the content moved, and does not say the request failed', async () => {
    const spy = mockFetch(409, {
      detail: 'این محتوا از زمانی که آن را دیدید تغییر کرده است؛'
              + ' دوباره بررسی و تأیید کنید.',
    })
    mount(UNCONFIRMED, EDITOR)
    fireEvent.click(screen.getByRole('button', { name: 'تأیید محتوا' }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(await screen.findByText(/تغییر کرده است/)).toBeInTheDocument()
    // The generic copy must be absent, not merely also present: 409 is the
    // server's settled answer that the document moved, and reporting it as
    // "it didn't work, try again" tells the editor to retry the very thing
    // that will keep being refused.
    expect(screen.queryByText(/دوباره تلاش کنید/)).toBeNull()
  })

  it('refetches the row after a 409, so the stale fingerprint on screen is replaced', async () => {
    // The screen is stale by definition when a 409 lands — the fingerprint it
    // holds is not the document's. Without this the editor is told to look
    // again at exactly the bytes that were already refused, forever.
    const spy = mockFetch(409, { detail: 'تغییر کرده است' })
    session = EDITOR
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidated: unknown[][] = []
    const real = qc.invalidateQueries.bind(qc)
    vi.spyOn(qc, 'invalidateQueries').mockImplementation((filters) => {
      invalidated.push((filters as { queryKey?: unknown[] } | undefined)?.queryKey ?? [])
      return real(filters)
    })
    render(
      <QueryClientProvider client={qc}>
        <ConfirmMark row={UNCONFIRMED} department="dining" />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'تأیید محتوا' }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    await waitFor(() =>
      expect(invalidated).toContainEqual(['confirmations', 'dining']))
  })

  it('reports anything that is not a 409 as a plain failure', async () => {
    const spy = mockFetch(500, { detail: 'boom' })
    mount(UNCONFIRMED, EDITOR)
    fireEvent.click(screen.getByRole('button', { name: 'تأیید محتوا' }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(await screen.findByText(/دوباره تلاش کنید/)).toBeInTheDocument()
    expect(screen.queryByText(/تغییر کرده است/)).toBeNull()
  })

  it('refetches the list after a confirmation lands, so the mark is not stale', async () => {
    const spy = mockFetch(200, { ...UNCONFIRMED, confirmed: true })
    session = EDITOR
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidated: unknown[][] = []
    const real = qc.invalidateQueries.bind(qc)
    vi.spyOn(qc, 'invalidateQueries').mockImplementation((filters) => {
      invalidated.push((filters as { queryKey?: unknown[] } | undefined)?.queryKey ?? [])
      return real(filters)
    })
    render(
      <QueryClientProvider client={qc}>
        <ConfirmMark row={UNCONFIRMED} department="dining" />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'تأیید محتوا' }))
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
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const invalidated: unknown[][] = []
    const real = qc.invalidateQueries.bind(qc)
    vi.spyOn(qc, 'invalidateQueries').mockImplementation((filters) => {
      invalidated.push((filters as { queryKey?: unknown[] } | undefined)?.queryKey ?? [])
      return real(filters)
    })
    render(
      <QueryClientProvider client={qc}>
        <ConfirmMark row={CONFIRMED} department="dining" />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'لغو تأیید' }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    await waitFor(() => {
      expect(invalidated).toContainEqual(['confirmations', 'dining'])
      expect(invalidated).toContainEqual(['departments'])
    })
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
