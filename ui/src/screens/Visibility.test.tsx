import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Visibility } from './Visibility'
import { paint, winner } from '../test/paint'
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


/** Same fixture as `DEFAULTS`, named the way the structural tests below refer
 *  to it — process_summary off, node_actor on, so «پنهان است» and «نمایش داده
 *  می‌شود» each have a row to be found on. */
const POLICY = DEFAULTS

/**
 * Stubs the server and mounts the screen in one call, for tests that only
 * care what is drawn — not who is asking or what a PUT changes.
 *
 * `hold: true` pins every PUT behind a promise this call's returned
 * `resolve()` releases, so a test can inspect the busy state (`aria-busy`,
 * `opacity-60`) before letting the flip land. Without it, a PUT resolves
 * immediately with the flipped field applied, the same shape `stubServer`
 * (below) answers with.
 */
function drawVisibility(
  fields: Record<string, boolean>,
  opts: { version?: string; putStatus?: number; hold?: boolean } = {},
) {
  let release: (() => void) | null = null
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { visible: boolean }
      put = { path, body }
      if (opts.hold) await new Promise<void>((res) => { release = res })
      const status = opts.putStatus ?? 200
      if (status !== 200) {
        return new Response(JSON.stringify({ detail: 'nope' }), { status, headers: JSON_HEAD })
      }
      const field = path.slice(path.lastIndexOf('/') + 1)
      return new Response(
        JSON.stringify({ fields: { ...fields, [field]: body.visible }, version: opts.version ?? 'ffffffffffffffff' }),
        { status: 200, headers: JSON_HEAD })
    }
    return new Response(JSON.stringify({ fields, version: opts.version ?? '0123456789abcdef' }),
      { status: 200, headers: JSON_HEAD })
  }))
  mount()
  return { resolve: () => release?.() }
}

describe('the policy card — one card of rows, not six floating ones', () => {
  it('is one card of rows, each with a drawn tick and a word for its state', async () => {
    drawVisibility(POLICY)
    const card = await screen.findByRole('group', { name: 'سیاست نمایش محتوا' })
    const rows = within(card).getAllByRole('checkbox')
    expect(rows).toHaveLength(6)
    // F5/X4 — `min-h-touch min-w-touch` on an `appearance:auto` checkbox
    // renders a 44px OS square with a 44px tick, beside a two-line block
    // ~40px tall. The control was bigger than the content it labelled, and
    // the same control is 16px elsewhere. §6.12 fixes it at 19×19.
    rows.forEach((r) => expect(r).toHaveClass('sr-only'))       // the input is the a11y layer
    expect(within(card).getAllByTestId('tick')).toHaveLength(6)
    // The left-hand state word — the thing that fills 55–60% of a blank row.
    const summary = within(card).getByRole('listitem', { name: 'خلاصهٔ فرآیند' })
    expect(within(summary).getByText('پنهان است')).toHaveClass('text-muted')
    const actor = within(card).getByRole('listitem', { name: 'مسئول فعالیت' })
    expect(within(actor).getByText('نمایش داده می‌شود')).toHaveClass('text-green')
  })

  it('separates rows with a hairline and does not rule off the last one', async () => {
    // This read `rows.slice(0, -1)` for `border-b` and `rows[last]` for
    // `last:border-b-0`, which looked like two claims and was one: all six
    // `<li>` share ONE className literal, so the split passed against an
    // implementation that branches on index and against one that does not, and
    // it would have passed with the rule written on the wrong row.
    //
    // What decides the last row is the VARIANT, and what a variant does is a
    // question about compiled CSS. Both halves are asserted where they live:
    // the literal is one string on every row, and `last:border-b-0` compiles to
    // a `:last-child` rule that zeroes the width. The last row's rendered
    // border is measured in a browser, in `e2e/visibility.spec.ts` — jsdom
    // resolves no variant and cannot answer it here.
    drawVisibility(POLICY)
    const rows = within(await screen.findByRole('group', { name: 'سیاست نمایش محتوا' }))
      .getAllByRole('listitem')
    expect(rows.length).toBeGreaterThan(1)
    expect(new Set(rows.map((r) => r.className)).size,
      'the rows carry more than one class string, so the claim below is about only some of them')
      .toBe(1)
    for (const r of rows) expect(r).toHaveClass('border-b', 'border-hair', 'last:border-b-0')

    const painted = await paint('border-b last:border-b-0')
    expect(winner(painted, 'border-bottom-width')).toBe('1px')
    expect(winner(painted, 'border-bottom-width', ':last-child')).toBe('0px')
  })

  it('looks busy rather than frozen while a flip is in flight', async () => {
    const { resolve } = drawVisibility(POLICY, { hold: true })
    await userEvent.click(await screen.findByRole('checkbox', { name: 'خلاصهٔ فرآیند' }))
    const card = screen.getByRole('group', { name: 'سیاست نمایش محتوا' })
    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(card).toHaveClass('opacity-60')
    // §4.6 Disabled — "keeps its surface and fades". S1 expresses it as an
    // opacity on the container, which is exactly one flip's worth of feedback
    // for a mutation that really does hold every row.
    resolve()
    await waitFor(() => expect(card).not.toHaveAttribute('aria-busy'))
  })
})

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
    //
    // A matcher FUNCTION, not a plain regex: F8/F9 (Task 23) puts the digest in
    // its own `dir="ltr"` span so it no longer bidi-reorders inside the Persian
    // sentence, and Testing Library's default text match only reads an
    // element's OWN direct text nodes — never a descendant element's — so a
    // plain string/regex can no longer see "prefix + digest" as one match once
    // the digest has its own wrapping element. `element.textContent` (native,
    // not `getNodeText`) still sees the whole line, and only the `<p>` has it.
    mount()
    expect(await screen.findByText((_, node) =>
      node?.textContent === 'نسخهٔ تنظیم: 0123456789abcdef')).toBeInTheDocument()
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

  it('answers a department-scoped holder of set_visibility the way the server does — not found, not refused', async () => {
    // The capability alone is not the gate the endpoints apply: they require it
    // at `*`, because one policy governs every department and a `dept:` holder
    // deciding it would be deciding for everyone else (D16). A screen gated on
    // the capability alone would draw this person six switches the server
    // refuses.
    //
    // **And the refusal is a 404, not a 403.** `access.requires` checks SCOPE
    // BEFORE CAPABILITY — *"the order is the whole point … they must not learn
    // it exists"* — so `GET /api/visibility` answers this caller 404, which
    // `tests/test_reader_sees_no_users.py:413` pins. This screen used to write
    // one status for both refusals and told them «اجازهٔ این کار را ندارید»:
    // *this exists, but not for you*, about a surface the 404 exists to keep
    // quiet. Owner: "i ok with not found 404."
    const seen = stubServer(DEFAULTS)
    session = { ...EDITOR, scopes: ['dept:cooking'] }
    mount()
    expect(await screen.findByText('چیزی اینجا نیست')).toBeInTheDocument()
    expect(screen.queryByText('اجازهٔ این کار را ندارید')).toBeNull()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    await waitFor(() => expect(seen.gets).toBe(0))
  })

  it('answers a caller refused by BOTH halves 404, because scope is asked first', async () => {
    // The one fixture that pins the ORDER rather than the pair. A `*`-scoped
    // caller without the capability is 403 under either ordering and a scoped
    // caller who holds it is 404 under either, so neither of the two tests
    // around this one can tell a screen that asks about the capability first
    // from one that asks about the scope first. This caller is refused on both
    // counts, and only the server's order gives 404.
    const seen = stubServer(DEFAULTS)
    session = { ...EDITOR, capabilities: ['view', 'edit'], scopes: ['dept:cooking'] }
    mount()
    expect(await screen.findByText('چیزی اینجا نیست')).toBeInTheDocument()
    expect(screen.queryByText('اجازهٔ این کار را ندارید')).toBeNull()
    await waitFor(() => expect(seen.gets).toBe(0))
  })

  it('shows the refusal surface when the server refuses the read', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'nope' }), { status: 403, headers: JSON_HEAD })))
    mount()
    expect(await screen.findByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('says the policy did not load when the read fails, rather than a page that stays blank', async () => {
    // `refusalStatus` maps 403 and 404 only, so every other failure — a 500
    // above all — fell straight through to `!data` and drew an empty page with
    // nothing on it to say so and nothing to try again with. There is no 422
    // half here: this screen takes no path parameter. The refusal test directly
    // above is the pair that keeps this from being written as "any error".
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'boom' }), { status: 500, headers: JSON_HEAD })))
    mount()
    expect(await screen.findByText('تنظیم نمایش محتوا بارگذاری نشد.')).toBeInTheDocument()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    // …and not the refusal surface: «اجازهٔ این کار را ندارید» would tell an
    // Editor who holds `set_visibility` that they do not.
    expect(screen.queryByText('اجازهٔ این کار را ندارید')).toBeNull()
  })

  it('offers a retry on that failure, and draws the switches when it succeeds', async () => {
    // `retryQuery` decides whether the button is worth drawing, and a 5xx is the
    // transient kind. Asserting the button alone would not show it is wired to
    // anything, so the second answer is a good one and the six switches arrive.
    let fail = true
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (fail) {
        return new Response(JSON.stringify({ detail: 'boom' }), { status: 500, headers: JSON_HEAD })
      }
      return new Response(JSON.stringify({ fields: DEFAULTS, version: '0123456789abcdef' }),
        { status: 200, headers: JSON_HEAD })
    }))
    mount()
    await screen.findByText('تنظیم نمایش محتوا بارگذاری نشد.')
    fail = false
    await userEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findAllByRole('checkbox')).toHaveLength(6)
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
