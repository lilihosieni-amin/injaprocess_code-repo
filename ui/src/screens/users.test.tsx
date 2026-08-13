import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Users } from './Users'
import { UserDetail } from './UserDetail'
import { PanelShell } from '../shell/PanelShell'
import type { AdminUser } from '../api/users'
import type { SessionDescriptor } from '../auth/session'

let session: SessionDescriptor | undefined
vi.mock('../auth/useSession', () => ({ useSession: () => ({ data: session }) }))

afterEach(() => {
  vi.restoreAllMocks()
  // `restoreAllMocks` does not undo `stubGlobal`, and `vite.config.ts` sets no
  // `unstubGlobals`, so without this the `fetch` a `describe` installed stays
  // installed for every block after it — and the header tests below, which
  // stub nothing of their own, were running against whatever the last list
  // test happened to leave behind.
  vi.unstubAllGlobals()
})

const JSON_HEAD = { 'Content-Type': 'application/json' }
const json = (body: unknown, status = 200, statusText = '') =>
  new Response(JSON.stringify(body), { status, statusText, headers: JSON_HEAD })

/**
 * The actor: an Editor holding every capability, scoped `*`. Everything below
 * that is *not* about who is looking uses this one.
 */
const EDITOR: SessionDescriptor = {
  username: '09120000000', displayName: 'ویدا مهرآیین', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers',
                 'view_audit', 'edit', 'confirm', 'set_visibility'],
  scopes: ['*'], supervisor: null, canSupervise: false, pendingApprovals: 0,
}

/** An Admin: `manage_users` without `manage_peers`, so the subset rule is strict. */
const ADMIN: SessionDescriptor = {
  ...EDITOR, username: '09129999999', displayName: 'کامران راد', role: 'admin',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users'],
}

/**
 * **Two rows that differ in every single field this screen renders.** A list is
 * where an index/key bug hides: `list[0]`'s role beside `list[1]`'s name passes
 * every assertion that only asks "is 'admin' on screen somewhere". Nothing below
 * is shared between these two — not the id, the number, the name, the role, the
 * capability set, the scopes, the supervisor, the supervisor's state, the
 * `canSupervise` bit, the disabled bit or the creation date.
 */
const SAHAR: AdminUser = {
  id: 7, username: '09121111111', displayName: 'سحر بیات',
  roleId: 3, role: 'admin', capabilities: ['view', 'comment', 'manage_users'],
  scopes: ['dept:cooking'],
  supervisor: { id: 21, username: '09123333333', displayName: 'مریم رستمی', disabled: false },
  canSupervise: false, disabled: false, createdAt: 1700000000,
}

const NADER: AdminUser = {
  id: 8, username: '09122222222', displayName: 'نادر قاسمی',
  roleId: 4, role: 'reader', capabilities: ['view'],
  scopes: ['dept:dining', 'dept:cashier'],
  supervisor: { id: 22, username: '09124444444', displayName: 'بابک آرام', disabled: true },
  canSupervise: true, disabled: true, createdAt: 1600000000,
}

/**
 * **The row that makes "the server's order" mean something.** Every value on it
 * sits strictly *between* Sahar's and Nader's — the number, the display name
 * («ش» falls between «س» and «ن»), the role name, the supervisor's name, the
 * creation date — and outside their range on the id, where "between 7 and 8" is
 * not available. Handed to the screen **first**, it is therefore in a position
 * no sort can produce: ascending puts the smallest first and descending puts the
 * largest first, and on every field this screen renders it is neither. The
 * boolean fields (`disabled`, `canSupervise`) cannot be "between", so the
 * fixture's three values are arranged so that a stable sort in either direction
 * still moves somebody.
 *
 * Two rows could not do this: with two rows "not ascending" *is* "descending",
 * and a reversed comparator — the commonest way to get a sort wrong — passed.
 */
const SHIRIN: AdminUser = {
  id: 6, username: '09121500000', displayName: 'شیرین کاویان',
  roleId: 2, role: 'auditor', capabilities: ['view', 'view_audit'],
  scopes: ['dept:bar'],
  supervisor: { id: 23, username: '09126666666', displayName: 'کیوان مرادی', disabled: false },
  canSupervise: false, disabled: false, createdAt: 1650000000,
}

/** A target the Admin above may not touch: it confers `edit`, which they lack. */
const EDITOR_ROW: AdminUser = {
  id: 9, username: '09125555555', displayName: 'هما نیک‌روش',
  roleId: 1, role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers',
                 'view_audit', 'edit', 'confirm', 'set_visibility'],
  scopes: ['*'], supervisor: null, canSupervise: true, disabled: false,
  createdAt: 1650000000,
}

interface Seen {
  gets: string[]
  writes: { path: string; body: unknown }[]
}

/**
 * A server that holds state, so a write is visible to the read that follows it.
 *
 * The disable endpoint really flips the stored row and answers with it. A screen
 * that never invalidates its query therefore keeps drawing the pre-write state
 * and is caught here — which is the whole point of storing the rows rather than
 * answering a fixed body twice.
 *
 * `gets` is a list of paths rather than a count so "never asked at all" is
 * observable: a screen that fires a request it knows will be refused puts a 403
 * in the console of every caller who lacks the capability, and «did not render»
 * cannot tell you whether it asked.
 */
function stubServer(rows: AdminUser[], opts: {
  readStatus?: number
  /** The value at `detail` in a refused read's body. */
  readDetail?: unknown
  writeStatus?: number
  /**
   * The value at `detail` in a refused write's body.
   *
   * `unknown`, not `string`, because **the shape is the point**. A string is
   * what `routers/users.py` writes for every refusal it decides itself. A
   * **list** is what FastAPI's own validation layer sends for a 422, and it is
   * not a shape `fetchJson` can read a sentence out of — which is how a Persian
   * screen came to be able to render «Unprocessable Entity».
   */
  writeDetail?: unknown
  /** What the browser exposes as `res.statusText` — the English the fallback
   *  reaches for when the body carried no sentence. */
  statusText?: string
} = {}): Seen {
  const state = new Map(rows.map((r) => [String(r.id), { ...r }]))
  const seen: Seen = { gets: [], writes: [] }
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      seen.writes.push({ path, body })
      const status = opts.writeStatus ?? 200
      if (status >= 400) {
        return json({ detail: opts.writeDetail ?? 'نه' }, status, opts.statusText)
      }
      const id = path.split('/')[3]
      const row = state.get(id)
      if (row && path.endsWith('/disabled')) {
        const next = { ...row, disabled: Boolean(body.disabled) }
        state.set(id, next)
        return json(next)
      }
      return new Response(null, { status: 204 })
    }
    seen.gets.push(path)
    const status = opts.readStatus ?? 200
    if (status >= 400) return json({ detail: opts.readDetail ?? 'نه' }, status, opts.statusText)
    if (path === '/api/users') return json([...state.values()])
    const row = state.get(path.slice('/api/users/'.length))
    return row ? json(row) : json({ detail: 'یافت نشد' }, 404)
  }))
  return seen
}

function mountList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/users']}>
        <Routes>
          <Route path="/users" element={<Users />} />
          <Route path="/users/:id" element={<UserDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** `id` is a string as often as a number, and deliberately: `:id` matches any
 *  string, so `/users/abc` is a route the app really has. */
function mountDetail(id: number | string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/users/${id}`]}>
        <Routes>
          <Route path="/users/:id" element={<UserDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** The row whose text carries this name. Never `rows[n]` — an index is exactly
 *  the thing these assertions exist to disbelieve. */
function rowOf(name: string): HTMLElement {
  const row = screen.getAllByRole('listitem').find((r) => r.textContent?.includes(name))
  if (!row) throw new Error(`no row for ${name}`)
  return row
}

/**
 * The rendered rows named, in the order they are on screen.
 *
 * It throws on a row it cannot name rather than reporting a default, so a
 * fixture that stops appearing is a failure here and not a silently shortened
 * list. None of the three names is a substring of another, and no supervisor in
 * any fixture is called any of them.
 */
const FIXTURE_NAMES = ['سحر بیات', 'نادر قاسمی', 'شیرین کاویان']
function renderedNames(): string[] {
  return screen.getAllByRole('listitem').map((r) => {
    const name = FIXTURE_NAMES.find((n) => r.textContent!.includes(n))
    if (!name) throw new Error(`row belongs to no fixture: ${r.textContent}`)
    return name
  })
}

beforeEach(() => { session = EDITOR })

describe('the user list', () => {
  it('draws one row per account', async () => {
    stubServer([SAHAR, NADER])
    mountList()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
  })

  it('puts each account\'s own name, number, role and supervisor on its own row', async () => {
    // The index/key assertion. Both rows are on screen either way, so a lookup
    // that pairs one user's name with the next user's role passes every
    // «getByText('admin')» in the file and fails only this.
    stubServer([SAHAR, NADER])
    mountList()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))

    const sahar = within(rowOf('سحر بیات'))
    expect(sahar.getByText('09121111111')).toBeInTheDocument()
    expect(sahar.getByText('admin')).toBeInTheDocument()
    expect(sahar.getByText(/مریم رستمی/)).toBeInTheDocument()
    expect(sahar.queryByText('reader')).toBeNull()
    expect(sahar.queryByText(/بابک آرام/)).toBeNull()

    const nader = within(rowOf('نادر قاسمی'))
    expect(nader.getByText('09122222222')).toBeInTheDocument()
    expect(nader.getByText('reader')).toBeInTheDocument()
    expect(nader.getByText(/بابک آرام/)).toBeInTheDocument()
    expect(nader.queryByText('admin')).toBeNull()
    expect(nader.queryByText(/مریم رستمی/)).toBeNull()
  })

  it('renders the accounts in the order the server sent them, re-sorting nothing', async () => {
    // **Added after two surviving mutants, and rewritten after a third; the
    // fixture order is the whole test.** Every other assertion in this block
    // finds its row by the name inside it, so a screen that renders `list[i+1]`
    // in `list[i]`'s place — swapping two rows wholesale — stays internally
    // consistent and passes all of them.
    //
    // Three rows, and three is the minimum. With two, "the order the server
    // sent" has exactly one alternative, so pinning *not-ascending* pins
    // *descending* too — and a reversed comparator, which is the commonest way
    // to get a sort wrong, passed the previous two-row version of this test.
    //
    // Shirin is sent **first** and is the middle value on every field this
    // screen draws (see her fixture). A sort in either direction has to open
    // with an extreme, so no `.sort()` on any rendered field — name, number,
    // role, supervisor, date, id, or either flag — can reproduce this list. The
    // server's own order is the only order that passes.
    //
    // Not cosmetic. The server orders by `username` precisely because display
    // names are not unique, and a list that re-sorts moves rows between two
    // identical requests — which is how an administrator disables the wrong
    // person's account.
    stubServer([SHIRIN, NADER, SAHAR])
    mountList()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3))
    expect(renderedNames()).toEqual(['شیرین کاویان', 'نادر قاسمی', 'سحر بیات'])
  })

  it('counts the matches against the whole installation, not against themselves', async () => {
    // Two numbers that are equal until something is typed, which is why the
    // filtered half is asserted as well: «۲ کاربر از ۲» is true of the screen
    // and true of a screen that prints one of the two counts twice.
    stubServer([SAHAR, NADER])
    mountList()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(screen.getByText('۲ کاربر از ۲')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('جست‌وجوی کاربر'), 'نادر')
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(screen.getByText('۱ کاربر از ۲')).toBeInTheDocument()
  })

  it('marks the disabled account disabled and the active one active — each on its own row', async () => {
    // Both directions, both bound to a row. Asserting only that «غیرفعال» is
    // somewhere on the page passes for a screen that draws it on every row, and
    // asserting only the disabled one passes for a screen that inverts the flag.
    stubServer([SAHAR, NADER])
    mountList()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))

    expect(within(rowOf('نادر قاسمی')).getByText('غیرفعال')).toBeInTheDocument()
    expect(within(rowOf('نادر قاسمی')).queryByText('فعال')).toBeNull()
    expect(within(rowOf('سحر بیات')).getByText('فعال')).toBeInTheDocument()
    expect(within(rowOf('سحر بیات')).queryByText('غیرفعال')).toBeNull()
  })

  it('says a disabled account is disabled in words, not in colour alone', async () => {
    // F11. `tone="neutral"` is reinforcement; a pill drawn with no label at all
    // still renders a grey box, and a grey box says nothing to a screen reader
    // and nothing at all in the printed page.
    stubServer([NADER])
    mountList()
    expect(await screen.findByText('غیرفعال')).toBeInTheDocument()
  })

  it('warns on the row of a user whose supervisor is disabled, and only there (D14)', async () => {
    // D14 refuses to repoint subordinates when a supervisor is disabled — the
    // gap is surfaced instead. A screen that does not surface it leaves an
    // approval route pointing at an account that can no longer sign in.
    stubServer([SAHAR, NADER])
    mountList()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(within(rowOf('نادر قاسمی')).getByText('سرپرست این کاربر غیرفعال است')).toBeInTheDocument()
    expect(within(rowOf('سحر بیات')).queryByText('سرپرست این کاربر غیرفعال است')).toBeNull()
  })

  it('filters by name', async () => {
    stubServer([SAHAR, NADER])
    mountList()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    await userEvent.type(screen.getByLabelText('جست‌وجوی کاربر'), 'نادر')
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(screen.getByText('نادر قاسمی')).toBeInTheDocument()
    expect(screen.queryByText('سحر بیات')).toBeNull()
  })

  it('filters by the number however the digits were typed', async () => {
    // Ordinary Persian keyboards emit ۰۹…, and the stored number is ASCII (D57).
    // Without the fold, searching for your own colleague's number by typing it
    // returns nothing at all — and looks exactly like "no such person".
    stubServer([SAHAR, NADER])
    mountList()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    await userEvent.type(screen.getByLabelText('جست‌وجوی کاربر'), '۱۱۱۱')
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(screen.getByText('سحر بیات')).toBeInTheDocument()
  })

  it('filters by role, which is the third thing the placeholder promises', async () => {
    // «نام، شماره یا نقش». The role clause is the one a screen can lose without
    // any other assertion in this file noticing: the two clauses above it still
    // answer every name and every number.
    stubServer([SAHAR, NADER])
    mountList()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(screen.getByLabelText('جست‌وجوی کاربر'))
      .toHaveAttribute('placeholder', 'نام، شماره یا نقش')
    await userEvent.type(screen.getByLabelText('جست‌وجوی کاربر'), 'reader')
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
    expect(screen.getByText('نادر قاسمی')).toBeInTheDocument()
    expect(screen.queryByText('سحر بیات')).toBeNull()
  })

  it('says so when the search matches nobody, rather than showing a bare page', async () => {
    stubServer([SAHAR, NADER])
    mountList()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    await userEvent.type(screen.getByLabelText('جست‌وجوی کاربر'), 'کسی')
    await waitFor(() => expect(screen.queryAllByRole('listitem')).toHaveLength(0))
    expect(screen.getByText('کاربری با این مشخصات پیدا نشد')).toBeInTheDocument()
    expect(screen.getByText('بخشی از نام، شماره یا نقش را بنویسید.')).toBeInTheDocument()
    // …and not the *other* empty state. Two accounts exist; a screen that says
    // none are registered has contradicted the request it just read.
    expect(screen.queryByText('هنوز کاربری ثبت نشده است')).toBeNull()
  })

  it('distinguishes an installation with no accounts from a search that matched none', async () => {
    // The only fixture in this file that sends an empty list, and without it the
    // empty-installation title has no input at all: every other test reaches the
    // empty state through the search box, where the other title is correct.
    stubServer([])
    mountList()
    expect(await screen.findByText('هنوز کاربری ثبت نشده است')).toBeInTheDocument()
    expect(screen.queryByText('کاربری با این مشخصات پیدا نشد')).toBeNull()
    // No search hint either: there is nothing to narrow.
    expect(screen.queryByText('بخشی از نام، شماره یا نقش را بنویسید.')).toBeNull()
  })

  it('opens one person\'s record when their row is chosen', async () => {
    stubServer([SAHAR, NADER])
    mountList()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    await userEvent.click(within(rowOf('سحر بیات')).getByRole('link'))
    expect(await screen.findByRole('heading', { name: 'سحر بیات' })).toBeInTheDocument()
    // …the record of the person whose row was chosen, not of the first row.
    expect(screen.queryByRole('heading', { name: 'نادر قاسمی' })).toBeNull()
  })

  it('points each row at that person\'s own record', async () => {
    // The href is the one thing about a row that is invisible on screen, and a
    // row linking to `/users/0` (or to the same id for everyone) looks correct
    // until it is clicked.
    stubServer([SAHAR, NADER])
    mountList()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(within(rowOf('سحر بیات')).getByRole('link')).toHaveAttribute('href', '/users/7')
    expect(within(rowOf('نادر قاسمی')).getByRole('link')).toHaveAttribute('href', '/users/8')
  })
})

describe('who the user list is drawn for', () => {
  it('refuses a caller without manage_users, and does not ask the server either', async () => {
    const seen = stubServer([SAHAR])
    session = { ...EDITOR, capabilities: ['view', 'edit', 'confirm', 'set_visibility'] }
    mountList()
    expect(await screen.findByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    await waitFor(() => expect(seen.gets).toEqual([]))
  })

  it('answers a caller scoped to one department the way the server does — not found, not refused', async () => {
    // `access.requires` checks scope BEFORE capability (D56): a scoped Admin is
    // answered 404, because user administration is not a thing they may learn
    // exists here, while a `*`-scoped caller lacking the capability is answered
    // 403. Rendering one message for both hands the scoped caller a sentence
    // that says the surface exists — the disclosure the 404 is there to refuse.
    const seen = stubServer([SAHAR])
    session = { ...EDITOR, scopes: ['dept:cooking'] }
    mountList()
    expect(await screen.findByText('چیزی اینجا نیست')).toBeInTheDocument()
    expect(screen.queryByText('اجازهٔ این کار را ندارید')).toBeNull()
    await waitFor(() => expect(seen.gets).toEqual([]))
  })

  it('answers a caller refused by BOTH halves the way the server does — 404, because scope is asked first', async () => {
    // **The one fixture that pins the order rather than the pair.** A scoped
    // caller who nonetheless holds `manage_users` is answered 404 by both
    // orderings, and a `*`-scoped caller without it is answered 403 by both — so
    // neither of the two tests above can tell a screen that asks about the
    // capability first from one that asks about the scope first. This Reader in
    // one department is refused on both counts, and only the server's order
    // gives 404: told 403 instead, they learn that a user-administration surface
    // exists here, which is the disclosure the 404 is there to refuse (D56).
    // `test_users_api.py` pins the same pair with the same kind of caller.
    stubServer([SAHAR])
    session = { ...EDITOR, capabilities: ['view', 'comment'], scopes: ['dept:cooking'] }
    mountList()
    expect(await screen.findByText('چیزی اینجا نیست')).toBeInTheDocument()
    expect(screen.queryByText('اجازهٔ این کار را ندارید')).toBeNull()
  })

  it('shows the refusal surface when the server refuses the read', async () => {
    stubServer([SAHAR], { readStatus: 403 })
    mountList()
    expect(await screen.findByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('shows the not-found surface when the server answers 404, not the refusal one', async () => {
    stubServer([SAHAR], { readStatus: 404 })
    mountList()
    expect(await screen.findByText('چیزی اینجا نیست')).toBeInTheDocument()
    expect(screen.queryByText('اجازهٔ این کار را ندارید')).toBeNull()
  })

  it('says the read failed when the server 500s — never that nobody is registered', async () => {
    // `refusalStatus` maps 403 and 404 and nothing else, so a 500 used to fall
    // through to `data ?? []` and out the empty-installation branch: the screen
    // told the one person who administers accounts that the installation has
    // none, on no evidence whatever, at the moment the database was unreachable.
    stubServer([SAHAR], { readStatus: 500 })
    mountList()
    expect(await screen.findByText('فهرست کاربران بارگذاری نشد.')).toBeInTheDocument()
    expect(screen.queryByText('هنوز کاربری ثبت نشده است')).toBeNull()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    // And it is worth asking again, which is exactly what a 5xx is and a 4xx is
    // not — decided by `retryQuery`, the same predicate the query itself uses.
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeInTheDocument()
  })

  it('re-reads on the retry rather than leaving the administrator to reload the page', async () => {
    const seen = stubServer([SAHAR], { readStatus: 500 })
    mountList()
    await userEvent.click(await screen.findByRole('button', { name: 'تلاش دوباره' }))
    await waitFor(() => expect(seen.gets.length).toBeGreaterThan(1))
    expect(seen.gets.every((p) => p === '/api/users')).toBe(true)
  })
})

function mountShell(descriptor: SessionDescriptor) {
  // Its own server. `PanelShell` fires `usePending` for anybody holding `edit`,
  // and these tests used to inherit whichever `fetch` the previous block had
  // stubbed — which, once that leak is closed, becomes no `fetch` at all.
  // Neither is an input this block chose.
  stubServer([])
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><PanelShell session={descriptor} /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the user-administration entry in the panel header', () => {
  it('is drawn for a `*`-scoped holder of manage_users', () => {
    mountShell(EDITOR)
    expect(screen.getByRole('link', { name: 'کاربران' })).toBeInTheDocument()
  })

  it('points at the user list', () => {
    mountShell(EDITOR)
    expect(screen.getByRole('link', { name: 'کاربران' })).toHaveAttribute('href', '/users')
  })

  it('is not drawn for a panel user who holds every panel capability except manage_users', () => {
    // The fixture that makes this pair non-vacuous: `edit`, `confirm`,
    // `set_visibility` and `view_audit` and NOT `manage_users`, so a gate
    // rewritten to `can(session, 'edit')` — or one that simply sits inside the
    // existing `canEdit` block, the likeliest way to write it by accident —
    // fails here rather than passing everything.
    mountShell({ ...EDITOR, capabilities: ['view', 'edit', 'confirm', 'set_visibility', 'view_audit'] })
    expect(screen.queryByRole('link', { name: 'کاربران' })).toBeNull()
  })

  it('is not drawn for an auditor', () => {
    mountShell({ ...EDITOR, capabilities: ['view', 'view_audit'] })
    expect(screen.queryByRole('link', { name: 'کاربران' })).toBeNull()
  })

  it('is not drawn for a holder of manage_users scoped to one department', () => {
    // The endpoints require the capability at `*` and answer a scoped caller
    // 404 (scope is checked first). A link into «چیزی اینجا نیست» is a link the
    // app itself drew into a wall.
    mountShell({ ...EDITOR, scopes: ['dept:cooking'] })
    expect(screen.queryByRole('link', { name: 'کاربران' })).toBeNull()
  })

  it('is drawn for a holder of manage_users who cannot edit', () => {
    // The other half of the pair above: an Admin holds `manage_users` and no
    // `edit`, and a gate spelled `canEdit && …` would hide the one surface that
    // is their whole job.
    mountShell(ADMIN)
    expect(screen.getByRole('link', { name: 'کاربران' })).toBeInTheDocument()
  })
})

describe('one person\'s record', () => {
  it('shows the account as the server reports it', async () => {
    stubServer([SAHAR])
    mountDetail(7)
    expect(await screen.findByRole('heading', { name: 'سحر بیات' })).toBeInTheDocument()
    expect(screen.getByText('09121111111')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('dept:cooking')).toBeInTheDocument()
    expect(screen.getByText(/مریم رستمی/)).toBeInTheDocument()
    expect(screen.getByText('فعال')).toBeInTheDocument()
  })

  it('lists every scope, not just the first', async () => {
    // `scopes[0]` renders correctly for the single-scope majority and silently
    // hides the second department of a head of two.
    stubServer([NADER])
    mountDetail(8)
    expect(await screen.findByText('dept:dining')).toBeInTheDocument()
    expect(screen.getByText('dept:cashier')).toBeInTheDocument()
  })

  it('reads the creation date as unix seconds, not milliseconds', async () => {
    // The server writes `int(time.time())`. Handed to `jalali` raw it is read as
    // milliseconds and prints ۱۳۴۸/… — five decades off and perfectly
    // plausible-looking. 1700000000 is 2023-11-14, i.e. ۱۴۰۲/۰۸/۲۳.
    stubServer([SAHAR])
    mountDetail(7)
    expect(await screen.findByText('۱۴۰۲/۰۸/۲۳')).toBeInTheDocument()
  })

  it('marks a disabled account disabled', async () => {
    stubServer([NADER])
    mountDetail(8)
    expect(await screen.findByText('غیرفعال')).toBeInTheDocument()
    expect(screen.queryByText('فعال')).toBeNull()
  })

  it('warns when this person\'s supervisor is disabled (D14)', async () => {
    stubServer([NADER])
    mountDetail(8)
    expect(await screen.findByText(/سرپرست این کاربر غیرفعال است/)).toBeInTheDocument()
  })

  it('says the supervisor flag is an org-chart fact that grants nothing (D51)', async () => {
    // `can_supervise` routes comment approval and confers no capability, no
    // scope and no rank. Drawn as «دسترسی سرپرستی» beside the role it reads as a
    // permission, and an administrator would then set it to give somebody
    // something — or refuse to set it to withhold something.
    stubServer([NADER])
    mountDetail(8)
    expect(await screen.findByText('می‌تواند سرپرست دیگران باشد')).toBeInTheDocument()
    expect(screen.getByText('این یک جایگاه در نمودار سازمانی است و هیچ دسترسی‌ای نمی‌دهد.'))
      .toBeInTheDocument()
  })

  it('does not claim the flag for somebody who does not carry it', async () => {
    stubServer([SAHAR])
    mountDetail(7)
    expect(await screen.findByRole('heading', { name: 'سحر بیات' })).toBeInTheDocument()
    expect(screen.getByText('نمی‌تواند سرپرست دیگران باشد')).toBeInTheDocument()
    expect(screen.queryByText('می‌تواند سرپرست دیگران باشد')).toBeNull()
  })

  it('shows the not-found surface for an id the server does not know', async () => {
    stubServer([SAHAR])
    mountDetail(404)
    expect(await screen.findByText('چیزی اینجا نیست')).toBeInTheDocument()
    expect(screen.queryByText('اجازهٔ این کار را ندارید')).toBeNull()
  })

  it('shows the refusal surface, not the not-found one, when the server answers 403', async () => {
    stubServer([SAHAR], { readStatus: 403 })
    mountDetail(7)
    expect(await screen.findByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
    expect(screen.queryByText('چیزی اینجا نیست')).toBeNull()
  })

  it('refuses a caller without manage_users without asking the server', async () => {
    const seen = stubServer([SAHAR])
    session = { ...EDITOR, capabilities: ['view', 'edit'] }
    mountDetail(7)
    expect(await screen.findByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
    await waitFor(() => expect(seen.gets).toEqual([]))
  })

  it('says the read failed when the server 500s, instead of a page that stays blank', async () => {
    // `!user` was every failure that is not 403 or 404 *and* the moment before
    // the read lands, so the two were drawn the same: nothing, for ever, with
    // no way to tell which it was and nothing to press.
    stubServer([SAHAR], { readStatus: 500 })
    mountDetail(7)
    expect(await screen.findByText('اطلاعات این کاربر بارگذاری نشد.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeInTheDocument()
  })

  it('says so for an id that is not a number, and does not offer to ask again', async () => {
    // `:id` matches any string, so `/users/abc` is a route this app really has
    // and is one typed URL away. `get_user(user_id: int)` answers it 422 — not
    // 403, not 404 — with FastAPI's own validation body, whose `detail` is a
    // list. Asking again cannot turn 'abc' into an integer, so there is no retry
    // to offer: `retryQuery` refuses every 4xx and the button follows it.
    stubServer([SAHAR], {
      readStatus: 422,
      readDetail: [{ type: 'int_parsing', loc: ['path', 'user_id'],
                     msg: 'Input should be a valid integer, unable to parse string as an integer',
                     input: 'abc' }],
      statusText: 'Unprocessable Entity',
    })
    mountDetail('abc')
    expect(await screen.findByText('اطلاعات این کاربر بارگذاری نشد.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تلاش دوباره' })).toBeNull()
    expect(screen.queryByText(/Unprocessable Entity/)).toBeNull()
  })
})

describe('the controls on one person\'s record', () => {
  it('offers them to an administrator who may act on this account', async () => {
    stubServer([SAHAR])
    mountDetail(7)
    expect(await screen.findByRole('button', { name: 'غیرفعال‌سازی حساب' })).toBeInTheDocument()
    expect(screen.getByLabelText('گذرواژهٔ تازه')).toBeInTheDocument()
  })

  it('withholds them on the administrator\'s own record, and says where to go instead', async () => {
    // D13: nobody edits their own record, and the server answers SELF_EDIT to
    // every write on this path. A screen that draws the controls anyway makes
    // the administrator find that out by pressing them.
    stubServer([{ ...SAHAR, username: EDITOR.username }])
    mountDetail(7)
    expect(await screen.findByText(/گذرواژهٔ خودتان را از صفحهٔ نمایه عوض کنید/)).toBeInTheDocument()
    // …and not the other reason. There are two, they send an administrator to
    // two different places, and only one of them is true here.
    expect(screen.queryByText(/دسترسی این حساب از دسترسی شما بیشتر است/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'غیرفعال‌سازی حساب' })).toBeNull()
    expect(screen.queryByLabelText('گذرواژهٔ تازه')).toBeNull()
  })

  it('withholds them from an Admin looking at an account that confers more than they hold', async () => {
    // The subset rule (D13). An Admin may not touch an Editor: every write here
    // comes back NOT_A_SUBSET, so the controls are drawn for nobody who would
    // only be refused.
    session = ADMIN
    stubServer([EDITOR_ROW])
    mountDetail(9)
    expect(await screen.findByRole('heading', { name: 'هما نیک‌روش' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'غیرفعال‌سازی حساب' })).toBeNull()
    expect(screen.queryByLabelText('گذرواژهٔ تازه')).toBeNull()
    // **Which sentence, not merely that the controls are gone.** Told the self
    // sentence here, an Admin reading somebody else's record is sent to their
    // own profile page to change something that is not the problem — and the
    // reason they were actually refused is never stated.
    expect(screen.getByText(/دسترسی این حساب از دسترسی شما بیشتر است/)).toBeInTheDocument()
    expect(screen.queryByText(/گذرواژهٔ خودتان را از صفحهٔ نمایه عوض کنید/)).toBeNull()
  })

  it('withholds them from an Admin looking at an equal, who has no manage_peers', async () => {
    // The `<` half of the rule: without `manage_peers` an account cannot clone
    // itself, so an Admin may not act on another Admin holding exactly what they
    // hold. A screen implementing `⊆` instead of `⊂` draws the controls here and
    // passes every other case in this file.
    session = ADMIN
    stubServer([{ ...SAHAR, capabilities: ADMIN.capabilities }])
    mountDetail(7)
    expect(await screen.findByRole('heading', { name: 'سحر بیات' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'غیرفعال‌سازی حساب' })).toBeNull()
    expect(screen.getByText(/دسترسی این حساب از دسترسی شما بیشتر است/)).toBeInTheDocument()
    expect(screen.queryByText(/گذرواژهٔ خودتان را از صفحهٔ نمایه عوض کنید/)).toBeNull()
  })

  it('withholds them from an account whose stored scope the grammar refuses', async () => {
    // **The one input that separates `mayManage`'s scope clause from its
    // absence**, and it is not a contrived one: `user_scopes.scope` is `TEXT NOT
    // NULL` with no CHECK, so `''` is storable today, and `scopeContains`
    // answers `false` for a malformed target *even to a `*` holder*. Every other
    // fixture that reaches `mayManage` is `*`-scoped — the gate upstairs
    // guarantees it — and `*` covers every well-formed scope, so without this
    // row the clause could be deleted outright and nothing would notice.
    //
    // The screen agrees with the server rather than guessing: `may_delegate`
    // says such an entry "is covered by nothing … so it comes back
    // SCOPE_NOT_COVERED rather than being conferred unchecked", so every write
    // from here really would be refused, and drawing the controls would send an
    // administrator to press them.
    stubServer([{ ...SAHAR, scopes: [''] }])
    mountDetail(7)
    expect(await screen.findByRole('heading', { name: 'سحر بیات' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'غیرفعال‌سازی حساب' })).toBeNull()
    expect(screen.queryByLabelText('گذرواژهٔ تازه')).toBeNull()
  })

  it('offers them to an Editor looking at an equal, who does have manage_peers', async () => {
    // The other side of the same line. `manage_peers` is what makes «may appoint
    // an equal» one bit in one role rather than a rank comparison (D13), and a
    // screen that ignores it hides the controls an Editor really does hold.
    stubServer([{ ...SAHAR, capabilities: EDITOR.capabilities }])
    mountDetail(7)
    expect(await screen.findByRole('button', { name: 'غیرفعال‌سازی حساب' })).toBeInTheDocument()
  })

  it('gives every control its own horizontal padding and type size', async () => {
    // `Button`'s BASE carries neither on purpose (I5) — the call site owns both
    // — so a bare `<Button>` renders as a 44 px touch box with its text jammed
    // against the edges. jsdom measures nothing, so the class is the only thing
    // any runnable test can see, and a previous task shipped two such buttons
    // because nothing asserted it.
    stubServer([SAHAR])
    mountDetail(7)
    await screen.findByRole('button', { name: 'غیرفعال‌سازی حساب' })
    for (const b of screen.getAllByRole('button')) {
      expect(b.className, `«${b.textContent}» has no horizontal padding`).toMatch(/(^|\s)px-/)
      expect(b.className, `«${b.textContent}» sets no type size`).toMatch(/(^|\s)text-(caption|body|subtitle)\b/)
    }
  })
})

describe('disabling and re-enabling an account', () => {
  it('sends the request and then shows what the server stored, without a reload', async () => {
    // The write lands and the screen keeps drawing the state from before it —
    // the defect species this whole surface is most exposed to, because the pill
    // it contradicts is the one thing an administrator reads to check the write
    // worked. The stub really flips its stored row, so only a screen that
    // re-reads can show «غیرفعال» here.
    const seen = stubServer([SAHAR])
    mountDetail(7)
    await userEvent.click(await screen.findByRole('button', { name: 'غیرفعال‌سازی حساب' }))
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].path).toBe('/api/users/7/disabled')
    expect(seen.writes[0].body).toEqual({ disabled: true })
    expect(await screen.findByText('غیرفعال')).toBeInTheDocument()
    expect(screen.queryByText('فعال')).toBeNull()
  })

  it('re-enables in the other direction, sending false', async () => {
    // One endpoint, both verbs (D14). A screen hardcoding `true` disables an
    // account that was already disabled and reports success.
    const seen = stubServer([NADER])
    mountDetail(8)
    await userEvent.click(await screen.findByRole('button', { name: 'فعال‌سازی حساب' }))
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body).toEqual({ disabled: false })
    expect(await screen.findByText('فعال')).toBeInTheDocument()
  })

  it('repeats the server\'s own sentence when the write is refused, and keeps the stored state', async () => {
    // The client cannot re-derive every refusal — the last-active-Editor guard
    // counts rows this screen never sees — so a refusal that reaches here is one
    // the drawn controls could not have predicted. Its Persian sentence is
    // written for this administrator and names something they can act on;
    // «انجام نشد» in its place throws that away.
    stubServer([SAHAR], {
      writeStatus: 403,
      writeDetail: 'این تنها ویرایشگر فعال سامانه است و دسترسی‌اش را نمی‌توان برداشت',
    })
    mountDetail(7)
    await userEvent.click(await screen.findByRole('button', { name: 'غیرفعال‌سازی حساب' }))
    expect(await screen.findByRole('alert'))
      .toHaveTextContent('این تنها ویرایشگر فعال سامانه است و دسترسی‌اش را نمی‌توان برداشت')
    expect(screen.getByText('فعال')).toBeInTheDocument()
  })

  it('does not put a framework\'s English on a Persian screen when a 4xx carries no sentence', async () => {
    // The server's own refusals are echoed because each is a Persian sentence
    // naming something to do next — but "4xx" is not a promise that one was
    // written. FastAPI's validation layer answers 422 with `detail` as a
    // **list**, which `fetchJson` cannot read a sentence out of, so it falls
    // back to `res.statusText`: «Unprocessable Entity», in English, in an alert,
    // to a Persian-speaking administrator. Same for a proxy-generated 429 or 413
    // with no JSON body at all.
    stubServer([SAHAR], {
      writeStatus: 422,
      writeDetail: [{ type: 'bool_parsing', loc: ['body', 'disabled'],
                      msg: 'Input should be a valid boolean' }],
      statusText: 'Unprocessable Entity',
    })
    mountDetail(7)
    await userEvent.click(await screen.findByRole('button', { name: 'غیرفعال‌سازی حساب' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('انجام نشد؛ دوباره تلاش کنید.')
    expect(screen.queryByText(/Unprocessable Entity/)).toBeNull()
    expect(screen.queryByText(/valid boolean/)).toBeNull()
  })

  it('says the same for a 5xx, whose detail is English by construction', async () => {
    // An unhandled exception behind FastAPI answers `{"detail": "Internal Server
    // Error"}` — a `detail` that *is* a string, and still not a sentence written
    // for anybody. A 5xx is not a refusal at all, so it never speaks for the
    // server; widening the echo to "any ApiError" puts this on the screen.
    stubServer([SAHAR], {
      writeStatus: 500, writeDetail: 'Internal Server Error',
      statusText: 'Internal Server Error',
    })
    mountDetail(7)
    await userEvent.click(await screen.findByRole('button', { name: 'غیرفعال‌سازی حساب' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('انجام نشد؛ دوباره تلاش کنید.')
    expect(screen.queryByText(/Internal Server Error/)).toBeNull()
    // The write did not land, so the stored state is what is still drawn.
    expect(screen.getByText('فعال')).toBeInTheDocument()
  })

  it('says nothing about failure while everything is succeeding', async () => {
    // The alert must be the consequence of a refusal, not furniture that is
    // always in the DOM — which would pass the test above for the wrong reason.
    stubServer([SAHAR])
    mountDetail(7)
    await userEvent.click(await screen.findByRole('button', { name: 'غیرفعال‌سازی حساب' }))
    expect(await screen.findByText('غیرفعال')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('setting somebody else\'s password (D15)', () => {
  it('sends the typed value straight to the account, with no round trip', async () => {
    const seen = stubServer([SAHAR])
    mountDetail(7)
    await userEvent.type(await screen.findByLabelText('گذرواژهٔ تازه'), 'sixchars')
    await userEvent.click(screen.getByRole('button', { name: 'ثبت گذرواژه' }))
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].path).toBe('/api/users/7/password')
    expect(seen.writes[0].body).toEqual({ password: 'sixchars' })
  })

  it('masks the field', async () => {
    // type="text" here puts somebody's new password on screen in a shared
    // office, and nothing else in this file would notice: every other assertion
    // reads the field by its label, which works the same either way.
    stubServer([SAHAR])
    mountDetail(7)
    expect(await screen.findByLabelText('گذرواژهٔ تازه')).toHaveAttribute('type', 'password')
  })

  it('does not cap the field short enough to store a different password than was typed', async () => {
    // Asserted on the attribute, not by typing, because jsdom does not enforce
    // maxLength at all — a browser would truncate where every test we can run
    // stays green, and the account would then hold a password nobody knows.
    stubServer([SAHAR])
    mountDetail(7)
    const cap = (await screen.findByLabelText('گذرواژهٔ تازه')).getAttribute('maxLength')
    expect(cap === null || Number(cap) >= 64).toBe(true)
  })

  it('refuses a value under six characters without spending an argon2 hash on it', async () => {
    // The server's floor is six (D58). Sending it anyway costs a ~61 ms hash on
    // the shared verify limiter to be told what the field already knew.
    const seen = stubServer([SAHAR])
    mountDetail(7)
    await userEvent.type(await screen.findByLabelText('گذرواژهٔ تازه'), 'five5')
    await userEvent.click(screen.getByRole('button', { name: 'ثبت گذرواژه' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('گذرواژه باید دست‌کم ۶ نویسه باشد')
    expect(seen.writes).toEqual([])
  })

  it('tells the administrator the value has to be handed over, and that the sessions are gone', async () => {
    // D15 is a direct set: there is no link, no token and no channel to deliver
    // one over, so the administrator IS the delivery mechanism. A silent success
    // leaves somebody locked out of an account whose password only the
    // administrator knows.
    stubServer([SAHAR])
    mountDetail(7)
    await userEvent.type(await screen.findByLabelText('گذرواژهٔ تازه'), 'sixchars')
    await userEvent.click(screen.getByRole('button', { name: 'ثبت گذرواژه' }))
    expect(await screen.findByText(/گذرواژهٔ تازه ثبت شد/)).toBeInTheDocument()
    expect(screen.getByText(/همهٔ نشست‌های این کاربر بسته شد/)).toBeInTheDocument()
  })

  it('clears the field afterwards, so the value is not left on screen', async () => {
    stubServer([SAHAR])
    mountDetail(7)
    const field = await screen.findByLabelText('گذرواژهٔ تازه')
    await userEvent.type(field, 'sixchars')
    await userEvent.click(screen.getByRole('button', { name: 'ثبت گذرواژه' }))
    await waitFor(() => expect(field).toHaveValue(''))
  })

  it('repeats the server\'s sentence when the reset is refused, and claims no success', async () => {
    stubServer([SAHAR], { writeStatus: 403, writeDetail: 'کسی نمی‌تواند حساب خودش را تغییر دهد' })
    mountDetail(7)
    await userEvent.type(await screen.findByLabelText('گذرواژهٔ تازه'), 'sixchars')
    await userEvent.click(screen.getByRole('button', { name: 'ثبت گذرواژه' }))
    expect(await screen.findByRole('alert'))
      .toHaveTextContent('کسی نمی‌تواند حساب خودش را تغییر دهد')
    expect(screen.queryByText(/گذرواژهٔ تازه ثبت شد/)).toBeNull()
  })
})
