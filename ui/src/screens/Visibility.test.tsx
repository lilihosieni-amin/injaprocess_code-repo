import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Visibility } from './Visibility'
import type { SessionDescriptor } from '../auth/session'

let session: SessionDescriptor | undefined
vi.mock('../auth/useSession', () => ({ useSession: () => ({ data: session }) }))

const EDITOR: SessionDescriptor = {
  username: '09120000000', displayName: 'و', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers',
                 'view_audit', 'edit', 'confirm', 'set_visibility'],
  scopes: ['*'], supervisor: null, canSupervise: false, pendingApprovals: 0,
}

const DEFAULTS = {
  process_summary: false, process_idef0: false, process_kpis: false,
  node_description: true, node_actor: true, node_icom: false,
}

let put: { path: string; body: unknown } | null

beforeEach(() => {
  put = null
  session = EDITOR
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      put = { path, body: JSON.parse(String(init.body)) }
      return new Response(JSON.stringify(
        { fields: { ...DEFAULTS, node_actor: false }, version: 'ffffffffffffffff' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify({ fields: DEFAULTS, version: '0123456789abcdef' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
})

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><Visibility /></QueryClientProvider>)
}

describe('the visibility policy screen', () => {
  it('lists all six switches with the values the server sent', async () => {
    mount()
    const boxes = await screen.findAllByRole('checkbox')
    expect(boxes).toHaveLength(6)
    expect(screen.getByRole('checkbox', { name: 'مسئول فعالیت' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'خلاصهٔ فرآیند' })).not.toBeChecked()
  })

  it('sends one field at a time, naming it in the path', async () => {
    mount()
    const box = await screen.findByRole('checkbox', { name: 'مسئول فعالیت' })
    await userEvent.click(box)
    await waitFor(() => expect(put).not.toBeNull())
    expect(put!.path).toBe('/api/visibility/node_actor')
    expect(put!.body).toEqual({ visible: false })
  })

  it('says the policy is the same for every non-editor', async () => {
    // The one thing an Editor must not misunderstand: this is not a per-role or
    // per-department grant (D16). Pinned as copy, not as a blacklist of words —
    // a blacklist can only forbid the misreadings someone thought of.
    mount()
    expect(await screen.findByText(
      'این تنظیم برای همهٔ کسانی که اجازهٔ ویرایش ندارند یکسان است.',
    )).toBeInTheDocument()
  })

  it('shows the policy version, because it is what a cached report is keyed on', async () => {
    mount()
    expect(await screen.findByText(/0123456789abcdef/)).toBeInTheDocument()
  })

  it('labels the version as a digest, not a counter, so flipping and flipping back does not read as growth', async () => {
    // The version is a digest of the policy, not a count of changes — flipping a
    // switch and flipping it back restores the earlier string. A label like
    // «شمارهٔ ویرایش (هر تغییر یکی زیاد می‌شود)» would imply the opposite, and
    // the substring match below is what a rewording like that breaks.
    mount()
    expect(await screen.findByText(/نسخهٔ تنظیم: 0123456789abcdef/)).toBeInTheDocument()
  })

  it('says the department introduction has no switch here and is always shown in full (D55)', async () => {
    // The neighbouring line about the policy being the same for every non-editor
    // is pinned above; this is the D55 sentence right below it, guarding the same
    // way.
    mount()
    expect(await screen.findByText(
      'معرفی دپارتمان همیشه به‌طور کامل نمایش داده می‌شود و تنظیمی ندارد.',
    )).toBeInTheDocument()
  })

  it('draws the switches in the order the store lists them: the process record first, then the node', async () => {
    mount()
    const boxes = await screen.findAllByRole('checkbox')
    expect(boxes.map((b) => b.getAttribute('aria-label'))).toEqual([
      'خلاصهٔ فرآیند', 'نمای IDEF0 فرآیند', 'شاخص‌های کلیدی فرآیند',
      'توضیح فعالیت', 'مسئول فعالیت', 'ICOM فعالیت',
    ])
  })

  it('gives every switch an accessible description naming what it governs', async () => {
    // The `aria-label` half of the accessible-name fix is already guarded by the
    // name-based checkbox queries above; this is the `aria-describedby` half.
    mount()
    const box = await screen.findByRole('checkbox', { name: 'مسئول فعالیت' })
    expect(box).toHaveAccessibleDescription('نقشی که انجام هر فعالیت بر عهدهٔ اوست.')
  })
})

const JSON_HEAD = { 'Content-Type': 'application/json' }

/**
 * A server that says what *this* test wants it to have said.
 *
 * The PUT echoes the whole policy back with the one field the request named
 * changed, which is what the real endpoint does — so a screen that redraws from
 * its own click rather than from the answer looks identical here until the
 * `version` is compared, and `version` is the one thing a click cannot invent.
 *
 * Returns a live counter of GETs so "never asked at all" is observable: a screen
 * that fires a request it knows will be refused puts a 403 in every Editor-less
 * console, and «did not render» cannot tell you whether it asked.
 */
function stubServer(
  fields: Record<string, boolean>,
  opts: { version?: string; putStatus?: number } = {},
) {
  const seen = { gets: 0 }
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { visible: boolean }
      put = { path, body }
      const status = opts.putStatus ?? 200
      if (status !== 200) {
        return new Response(JSON.stringify({ detail: 'nope' }), { status, headers: JSON_HEAD })
      }
      const field = path.slice(path.lastIndexOf('/') + 1)
      return new Response(
        JSON.stringify({ fields: { ...fields, [field]: body.visible }, version: 'ffffffffffffffff' }),
        { status: 200, headers: JSON_HEAD })
    }
    seen.gets += 1
    return new Response(
      JSON.stringify({ fields, version: opts.version ?? '0123456789abcdef' }),
      { status: 200, headers: JSON_HEAD })
  }))
  return seen
}

describe('who the visibility policy screen is drawn for', () => {
  it('refuses a caller without set_visibility, and does not ask the server either', async () => {
    // The nav entry is the only *link* to this screen, so the only way here
    // without the capability is by typing the path — which is exactly the case a
    // gate that lives only in the header does not cover.
    const seen = stubServer(DEFAULTS)
    session = { ...EDITOR, capabilities: ['view', 'edit', 'confirm', 'view_audit'] }
    mount()
    expect(await screen.findByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    await waitFor(() => expect(seen.gets).toBe(0))
  })

  it('refuses a department-scoped holder of set_visibility', async () => {
    // The capability alone is not the gate the endpoints apply: they require it
    // at `*`, because one policy governs every department and a `dept:` holder
    // deciding it would be deciding for everyone else (D16). A screen gated on
    // the capability alone would draw this person six switches the server
    // answers 403 to.
    const seen = stubServer(DEFAULTS)
    session = { ...EDITOR, scopes: ['dept:cooking'] }
    mount()
    expect(await screen.findByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    await waitFor(() => expect(seen.gets).toBe(0))
  })

  it('shows the refusal surface when the server refuses the read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'nope' }), { status: 403, headers: JSON_HEAD })))
    mount()
    expect(await screen.findByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })
})

describe('what a flip sends and what the screen then shows', () => {
  it('turns a hidden field on, sending true for that field', async () => {
    // The mirror of the brief's off-case, against the same fixture: a screen
    // that hardcodes `visible: false`, or negates the sense, passes one of these
    // two and fails the other. One direction alone can never see it.
    stubServer(DEFAULTS)
    mount()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'خلاصهٔ فرآیند' }))
    await waitFor(() => expect(put).not.toBeNull())
    expect(put!.path).toBe('/api/visibility/process_summary')
    expect(put!.body).toEqual({ visible: true })
  })

  it('shows the answer to the flip without a reload, version included', async () => {
    // The previous task's defect: the write landed and the screen kept drawing
    // the state from before it. `version` is the assertion that matters — a
    // checkbox can change because the browser toggled it, but only the server's
    // answer carries a digest, so a screen that redraws from its own click
    // cannot produce this string.
    stubServer(DEFAULTS)
    mount()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'مسئول فعالیت' }))
    expect(await screen.findByText(/ffffffffffffffff/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'مسئول فعالیت' })).not.toBeChecked()
    expect(screen.queryByText(/0123456789abcdef/)).toBeNull()
  })

  it('says so when a flip is refused, and keeps showing the stored value', async () => {
    // Both halves matter. A swallowed 500 leaves an Editor believing they just
    // published something; and a switch that stays where the click left it says
    // the field is now visible when the server never changed it.
    stubServer(DEFAULTS, { putStatus: 500 })
    mount()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'مسئول فعالیت' }))
    // The text matters, not just the role: an alert that says the flip *saved*
    // would still satisfy `findByRole('alert')` alone, and a live region is the
    // one place an Editor whose flip just 500'd would actually be told.
    expect(await screen.findByRole('alert')).toHaveTextContent('انجام نشد؛ دوباره تلاش کنید.')
    expect(screen.getByRole('checkbox', { name: 'مسئول فعالیت' })).toBeChecked()
    expect(screen.getByText(/0123456789abcdef/)).toBeInTheDocument()
  })

  it('says nothing about failure while everything is succeeding', async () => {
    // The alert must be the consequence of a refusal, not furniture — an alert
    // that is always in the DOM would pass the test above for the wrong reason.
    stubServer(DEFAULTS)
    mount()
    await userEvent.click(await screen.findByRole('checkbox', { name: 'مسئول فعالیت' }))
    expect(await screen.findByText(/ffffffffffffffff/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('disables every switch while a flip is in flight, so a second click cannot race it', async () => {
    // One field per request is what the endpoint takes; nothing here stops a
    // second click from firing a second one while the first is still in flight.
    //
    // **A second, untouched switch is what makes this "every".** Asserting only
    // the clicked box passes against `disabled={set.isPending && set.variables
    // ?.field === field}` — the other five stay live, two PUTs race, and
    // `useSetVisibilityField` writes each answer into the cache with
    // `setQueryData`, so the slower response wins and the screen settles on a
    // `fields`/`version` pair that is not the last flip. The Editor is then
    // looking at a policy nobody chose.
    let resolvePut!: (r: Response) => void
    const putPromise = new Promise<Response>((resolve) => { resolvePut = resolve })
    vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        put = { path, body: JSON.parse(String(init.body)) }
        return putPromise
      }
      return new Response(JSON.stringify({ fields: DEFAULTS, version: '0123456789abcdef' }),
        { status: 200, headers: JSON_HEAD })
    }))
    mount()
    const box = await screen.findByRole('checkbox', { name: 'مسئول فعالیت' })
    const other = screen.getByRole('checkbox', { name: 'خلاصهٔ فرآیند' })
    await userEvent.click(box)
    await waitFor(() => expect(put).not.toBeNull())
    expect(box).toBeDisabled()
    expect(other).toBeDisabled()
    resolvePut(new Response(
      JSON.stringify({ fields: { ...DEFAULTS, node_actor: false }, version: 'ffffffffffffffff' }),
      { status: 200, headers: JSON_HEAD }))
    await waitFor(() => expect(box).not.toBeDisabled())
    // …and the other one comes back with it: a guard that never lifts is a
    // screen an Editor can flip exactly once.
    expect(other).not.toBeDisabled()
  })

  it('invalidates the process and processes caches, since every document body is downstream of the policy', async () => {
    // The fixture this matters for: a role holding `set_visibility` without
    // `edit` (PanelShell.visibility.test.tsx) is a non-editor for the content
    // filter and would otherwise keep reading pre-flip bodies from cache.
    stubServer(DEFAULTS)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const keys: unknown[][] = []
    const real = qc.invalidateQueries.bind(qc)
    vi.spyOn(qc, 'invalidateQueries').mockImplementation((filters) => {
      keys.push((filters as { queryKey?: unknown[] } | undefined)?.queryKey ?? [])
      return real(filters)
    })
    render(<QueryClientProvider client={qc}><Visibility /></QueryClientProvider>)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'مسئول فعالیت' }))
    await waitFor(() => expect(put).not.toBeNull())
    expect(keys).toContainEqual(['process'])
    expect(keys).toContainEqual(['processes'])
  })
})

describe('the switch set is the server\'s, not a list in this file', () => {
  it('draws a seventh field the server declared but this file has no wording for', async () => {
    // The failure this guards is one-directional and silent: a field the backend
    // starts filtering on, with no switch anywhere to turn it off, published to
    // every reader with the screen that governs it showing six happy rows.
    stubServer({ ...DEFAULTS, node_evidence: false })
    mount()
    expect(await screen.findAllByRole('checkbox')).toHaveLength(7)
    expect(screen.getByRole('checkbox', { name: 'node_evidence' })).not.toBeChecked()
  })

  it('draws no switch for a field the server does not know', async () => {
    // The reverse, and it is not harmless: `data.fields[field]` is `undefined`
    // for a field the server dropped, which renders as an unchecked box — a
    // switch reading "hidden" for something that has no policy at all, and a PUT
    // the endpoint answers 404 to if anyone touches it.
    const five = Object.fromEntries(
      Object.entries(DEFAULTS).filter(([field]) => field !== 'node_icom'))
    stubServer(five)
    mount()
    expect(await screen.findAllByRole('checkbox')).toHaveLength(5)
    expect(screen.queryByRole('checkbox', { name: 'ICOM فعالیت' })).toBeNull()
  })
})
