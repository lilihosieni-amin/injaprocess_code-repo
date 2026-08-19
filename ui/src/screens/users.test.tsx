import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Users } from './Users'
import { UserDetail } from './UserDetail'
import { PanelShell } from '../shell/PanelShell'
import type { AdminUser } from '../api/users'
import type { Department } from '../api/types'
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

/**
 * The department registry, which is what turns a stored scope key into the name
 * the design prints. Typed as the endpoint's own response type so a renamed or
 * widened field is a `tsc -b` error here rather than a screen that renders
 * `undefined` under a test that never reads the payload.
 *
 * Every code below is one some fixture above really holds, and no two names
 * share a substring: «سالن» / «صندوق» / «پخت» / «بار».
 */
const DEPARTMENTS: Department[] = [
  { code: 'cooking', name: 'پخت', count: 6, subs: 3, conflicts: 0 },
  { code: 'dining', name: 'سالن', count: 4, subs: 1, conflicts: 0 },
  { code: 'cashier', name: 'صندوق', count: 2, subs: 0, conflicts: 0 },
  { code: 'bar', name: 'بار', count: 1, subs: 0, conflicts: 0 },
]

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
  /** The department registry `GET /api/departments` answers. */
  departments?: Department[]
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
    // The registry the record screen reads to name a scope. Served from the
    // same stub as the accounts so a test that renders one person's record does
    // not have to remember a second endpoint — and it is a real answer rather
    // than a 404, because `scopeLabel` falls back to the stored CODE when the
    // registry is missing, which would let «names the department» pass on the
    // very fallback it exists to disbelieve.
    if (path === '/api/departments') return json(opts.departments ?? DEPARTMENTS)
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

/**
 * One person's record, mounted for a named actor, with the account and the
 * department registry **already in cache**.
 *
 * Seeded rather than only stubbed, because most of what §6.8 has to be held to
 * is an ABSENCE — three panels that a viewer who may not manage this account
 * must not be shown. An absence asserted while `GET /api/users/{id}` is still
 * in flight passes for the wrong reason: in that window the screen draws
 * nothing at all, so «no ویرایش button» is a true sentence about a blank page
 * and says nothing whatever about the gate it was written for. With the row in
 * cache the first paint is the loaded record, and «absent» can only mean the
 * gate. The stub stays installed underneath for the writes, and for the
 * background re-read react-query fires on mount.
 */
function renderDetail(
  actor: SessionDescriptor,
  user: AdminUser,
  opts: Parameters<typeof stubServer>[1] = {},
) {
  session = actor
  const seen = stubServer([user], opts)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  qc.setQueryData(['users', String(user.id)], user)
  qc.setQueryData(['departments'], opts.departments ?? DEPARTMENTS)
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/users/${user.id}`]}>
        <Routes>
          <Route path="/users/:id" element={<UserDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...view, seen }
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
    // «getByText('مدیر')» in the file and fails only this.
    stubServer([SAHAR, NADER])
    mountList()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))

    const sahar = within(rowOf('سحر بیات'))
    expect(sahar.getByText('09121111111')).toBeInTheDocument()
    expect(sahar.getByText('مدیر')).toBeInTheDocument()
    expect(sahar.getByText(/مریم رستمی/)).toBeInTheDocument()
    expect(sahar.queryByText('خواننده')).toBeNull()
    expect(sahar.queryByText(/بابک آرام/)).toBeNull()

    const nader = within(rowOf('نادر قاسمی'))
    expect(nader.getByText('09122222222')).toBeInTheDocument()
    expect(nader.getByText('خواننده')).toBeInTheDocument()
    expect(nader.getByText(/بابک آرام/)).toBeInTheDocument()
    expect(nader.queryByText('مدیر')).toBeNull()
    expect(nader.queryByText(/مریم رستمی/)).toBeNull()
  })

  it('names the role in Persian, and leaves a role it has no wording for legible', async () => {
    // The identifiers reached the screen raw — `admin`, `reader`,
    // `reader_no_download` — as the only latin text on a row whose search box
    // offers «نقش» as something to type.
    //
    // **Both fixtures matter and neither alone is the test.** Sahar's `admin`
    // is a seeded role and must be translated; Shirin's `auditor` is not seeded
    // at all, and a map that answered «—» or a blank for the unknown would tell
    // an administrator the account has no role — a different, false fact. A
    // mutant that drops the fallback and renders nothing passes every assertion
    // about Sahar.
    stubServer([SAHAR, SHIRIN])
    mountList()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    expect(within(rowOf('سحر بیات')).getByText('مدیر')).toBeInTheDocument()
    expect(within(rowOf('شیرین کاویان')).getByText('auditor')).toBeInTheDocument()
    // …and the identifier of a role that *does* have wording is nowhere on the
    // screen, which is what makes this a translation rather than an addition.
    expect(screen.queryByText('admin')).toBeNull()
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

  it('filters by the Persian role as well, which is the only spelling on the row', async () => {
    // The pair of the test above, and the half that would otherwise be broken:
    // the role is now drawn as «خواننده», so a search that matched only the
    // stored `reader` promises «نقش» while answering nothing to the one word
    // anybody can read off the screen. The identifier clause stays because an
    // administrator who knows the seeded names should not lose a search that
    // used to work — which is why both are asserted, in two tests, against the
    // same two rows.
    stubServer([SAHAR, NADER])
    mountList()
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
    await userEvent.type(screen.getByLabelText('جست‌وجوی کاربر'), 'خواننده')
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
      {/*
        `/departments` and not the router's default `/`. §6.0 draws the top bar
        on the home screen and the crumb strip on every other one, and this entry
        lives in the top bar's «مدیریت» popover — so at `/` there is no popover
        to open, `entry()` below is null for every session, and all six tests in
        this block would agree with each other while measuring nothing at all.
        Three of them are `toBeNull()` assertions and would have gone green.
      */}
      <MemoryRouter initialEntries={['/departments']}><PanelShell session={descriptor} /></MemoryRouter>
    </QueryClientProvider>,
  )
}

/**
 * Open the «مدیریت» popover and hand back the user-administration entry, or
 * null. §6.0 moved this entry out of the bar and into that menu; it is still an
 * `<a href>` and still announces its route, and `role="menuitem"` is what puts
 * it inside the menu its trigger says it opens.
 *
 * Matched by pattern rather than by exact name: every row carries the hint line
 * §6.0 gives it, so the accessible name is both lines run together.
 */
async function adminEntry() {
  await userEvent.click(screen.getByRole('button', { name: /مدیریت/ }))
  // The menu is on screen whatever this session holds, so a null below is this
  // entry being gated and never the popover failing to open.
  expect(screen.getByRole('menu')).toBeInTheDocument()
  return screen.queryByRole('menuitem', { name: /^کاربران/ })
}

describe('the user-administration entry in the panel header', () => {
  it('is drawn for a `*`-scoped holder of manage_users', async () => {
    mountShell(EDITOR)
    expect(await adminEntry()).toBeInTheDocument()
  })

  it('points at the user list', async () => {
    mountShell(EDITOR)
    expect(await adminEntry()).toHaveAttribute('href', '/users')
  })

  it('is not drawn for a panel user who holds every panel capability except manage_users', async () => {
    // The fixture that makes this pair non-vacuous: `edit`, `confirm`,
    // `set_visibility` and `view_audit` and NOT `manage_users`, so a gate
    // rewritten to `can(session, 'edit')` — or one that simply sits inside the
    // existing `canEdit` block, the likeliest way to write it by accident —
    // fails here rather than passing everything.
    mountShell({ ...EDITOR, capabilities: ['view', 'edit', 'confirm', 'set_visibility', 'view_audit'] })
    expect(await adminEntry()).toBeNull()
  })

  it('is not drawn for an auditor', async () => {
    mountShell({ ...EDITOR, capabilities: ['view', 'view_audit'] })
    expect(await adminEntry()).toBeNull()
  })

  it('is not drawn for a holder of manage_users scoped to one department', async () => {
    // The endpoints require the capability at `*` and answer a scoped caller
    // 404 (scope is checked first). A link into «چیزی اینجا نیست» is a link the
    // app itself drew into a wall.
    mountShell({ ...EDITOR, scopes: ['dept:cooking'] })
    expect(await adminEntry()).toBeNull()
  })

  it('is drawn for a holder of manage_users who cannot edit', async () => {
    // The other half of the pair above: an Admin holds `manage_users` and no
    // `edit`, and a gate spelled `canEdit && …` would hide the one surface that
    // is their whole job.
    mountShell(ADMIN)
    expect(await adminEntry()).toBeInTheDocument()
  })
})

describe('one person\'s record', () => {
  it('shows the account as the server reports it', async () => {
    renderDetail(EDITOR, SAHAR)
    expect(await screen.findByRole('heading', { name: 'سحر بیات' })).toBeInTheDocument()
    expect(screen.getByText('09121111111')).toBeInTheDocument()
    expect(screen.getByText('مدیر')).toBeInTheDocument()
    // The department's NAME. §6.8 prints «پخت» where the row stores
    // `dept:cooking`, which is a storage key and not a word anybody reads.
    expect(screen.getByText('پخت')).toBeInTheDocument()
    expect(screen.getByText('مریم رستمی')).toBeInTheDocument()
  })

  it('lists every scope, not just the first', async () => {
    // `scopes[0]` renders correctly for the single-scope majority and silently
    // hides the second department of a head of two.
    renderDetail(EDITOR, NADER)
    expect(await screen.findByText('سالن')).toBeInTheDocument()
    expect(screen.getByText('صندوق')).toBeInTheDocument()
  })

  it('draws no creation date, because §6.8 has no field for one', async () => {
    // **The guard this replaces, and why it went.** It asserted that
    // `createdAt` — unix SECONDS (`users.created_at` is `INTEGER DEFAULT
    // (unixepoch())`), not the ISO string every timestamp in `api/types.ts` is
    // — was multiplied before `jalali` saw it; handed over raw it read as
    // milliseconds and printed ۱۳۴۸/…, five decades off and perfectly
    // plausible-looking. §6.8's four panels have nowhere to print a creation
    // date, so the field is gone from this screen and the guard with it. Stated
    // as an assertion rather than deleted, so its removal is a decision on the
    // record. `jalali` itself is still covered by `lib/format.test.ts`, and
    // **no screen in this app renders `createdAt` any more** — reported.
    renderDetail(EDITOR, SAHAR)
    await screen.findByRole('heading', { name: 'سحر بیات' })
    expect(screen.queryByText(/۱۴۰۲/)).toBeNull()
  })

  it('says a disabled account is disabled where §6.8 puts it — on the danger card', async () => {
    // The `StatusPill` beside the name is gone: §6.8 draws no pill there, and
    // the account's state is the danger card's whole subject. The deliverable
    // binds ONE label (`{{ disableLabel }}`) to that card's heading and to its
    // button, so a screen that read the flag backwards would say «غیرفعال‌سازی»
    // on an account that is already off.
    renderDetail(EDITOR, NADER)
    expect(await screen.findByRole('group', { name: 'فعال‌سازی کاربر' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'فعال‌سازی کاربر' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'غیرفعال‌سازی کاربر' })).toBeNull()
  })

  it('warns when this person\'s supervisor is disabled (D14)', async () => {
    // D14 leaves a disabled supervisor in place rather than quietly repointing
    // the people under them, so the gap is stated here or nowhere. §6.8's own
    // sentence says where the comments go instead, which the old one did not.
    renderDetail(EDITOR, NADER)
    expect(await screen.findByText(
      'این سرپرست غیرفعال است — کامنت‌های این کاربر یک پله بالاتر می‌روند.'))
      .toBeInTheDocument()
  })

  it('says the supervisor flag is an org-chart fact that grants nothing (D51)', async () => {
    // `can_supervise` routes comment approval and confers no capability, no
    // scope and no rank. Drawn as «دسترسی سرپرستی» beside the role it reads as a
    // permission, and an administrator would then set it to give somebody
    // something — or refuse to set it to withhold something.
    renderDetail(EDITOR, NADER)
    const sup = await screen.findByRole('group', { name: 'سرپرست' })
    expect(within(sup).getByText(/هیچ\s*دسترسی‌ای نمی‌دهد/)).toBeInTheDocument()
    expect(within(sup).getByText(/این کاربر خودش می‌تواند سرپرست دیگران باشد/))
      .toBeInTheDocument()
  })

  it('does not claim the flag for somebody who does not carry it', async () => {
    renderDetail(EDITOR, SAHAR)
    const sup = await screen.findByRole('group', { name: 'سرپرست' })
    expect(within(sup).getByText(/این کاربر سرپرست کسی نمی‌شود/)).toBeInTheDocument()
    expect(within(sup).queryByText(/می‌تواند سرپرست دیگران باشد/)).toBeNull()
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
    // Not one read at all, the department registry included: §6.8 panel 1 reads
    // it to name a scope, and it does so from a child component that this
    // refusal never mounts — so a caller who is about to be shown a 403 asks
    // the server for nothing. `useUser`'s `enabled` flag is the same idea one
    // line further up; a `useDepartments()` in the screen body would sit ABOVE
    // the early return and fire regardless.
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
    renderDetail(EDITOR, SAHAR)
    expect(await screen.findByRole('button', { name: 'غیرفعال‌سازی کاربر' })).toBeInTheDocument()
    expect(screen.getByLabelText('گذرواژهٔ تازه')).toBeInTheDocument()
    // Both editing entrances, and they are one surface: the header's «ویرایش»
    // and the supervisor panel's «تغییر سرپرست» open the same dialog, because
    // the edge and the scopes are re-validated together on the server.
    expect(screen.getByRole('button', { name: 'ویرایش' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'تغییر سرپرست' })).toBeInTheDocument()
  })

  it('withholds them on the administrator\'s own record, and says nothing (R5)', async () => {
    // D13: nobody edits their own record, and the server answers SELF_EDIT to
    // every write on this path. A screen that draws the controls anyway makes
    // the administrator find that out by pressing them.
    //
    // **And it explains nothing.** The sentence that stood here sent the reader
    // to «نمایه» for the one thing they may change — but `PanelShell` carries
    // that entry in the nav on every screen, so this was a second, worse route
    // to a link already on the page, and R5 draws no refusal.
    renderDetail(EDITOR, { ...SAHAR, username: EDITOR.username })
    await screen.findByRole('heading', { name: 'سحر بیات' })
    expect(screen.queryByText(/حساب خودتان را از این صفحه/)).toBeNull()
    expect(screen.queryByText(/گذرواژهٔ خودتان را از صفحهٔ نمایه عوض کنید/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'ویرایش' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'تغییر سرپرست' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'غیرفعال‌سازی کاربر' })).toBeNull()
    expect(screen.queryByLabelText('گذرواژهٔ تازه')).toBeNull()
  })

  it('withholds them from an Admin looking at an account that confers more than they hold', async () => {
    // The subset rule (D13). An Admin may not touch an Editor: every write here
    // comes back NOT_A_SUBSET, so the controls are drawn for nobody who would
    // only be refused.
    renderDetail(ADMIN, EDITOR_ROW)
    expect(await screen.findByRole('heading', { name: 'هما نیک‌روش' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'غیرفعال‌سازی کاربر' })).toBeNull()
    expect(screen.queryByLabelText('گذرواژهٔ تازه')).toBeNull()
    // **R5 even here.** This refusal depends on the TARGET rather than on the
    // caller — «this account holds more than you do» — and the rule does not
    // bend for that: the panels are absent, and nothing stands in their place.
    expect(screen.queryByText(/دسترسی این حساب از دسترسی شما بیشتر است/)).toBeNull()
    expect(screen.queryByText(/گذرواژهٔ خودتان را از صفحهٔ نمایه عوض کنید/)).toBeNull()
  })

  it('withholds them from an Admin looking at an equal, who has no manage_peers', async () => {
    // The `<` half of the rule: without `manage_peers` an account cannot clone
    // itself, so an Admin may not act on another Admin holding exactly what they
    // hold. A screen implementing `⊆` instead of `⊂` draws the controls here and
    // passes every other case in this file.
    renderDetail(ADMIN, { ...SAHAR, capabilities: ADMIN.capabilities })
    expect(await screen.findByRole('heading', { name: 'سحر بیات' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'غیرفعال‌سازی کاربر' })).toBeNull()
    expect(screen.queryByText(/دسترسی این حساب از دسترسی شما بیشتر است/)).toBeNull()
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
    renderDetail(EDITOR, { ...SAHAR, scopes: [''] })
    expect(await screen.findByRole('heading', { name: 'سحر بیات' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'غیرفعال‌سازی کاربر' })).toBeNull()
    expect(screen.queryByLabelText('گذرواژهٔ تازه')).toBeNull()
  })

  it('offers them to an Editor looking at an equal, who does have manage_peers', async () => {
    // The other side of the same line. `manage_peers` is what makes «may appoint
    // an equal» one bit in one role rather than a rank comparison (D13), and a
    // screen that ignores it hides the controls an Editor really does hold.
    renderDetail(EDITOR, { ...SAHAR, capabilities: EDITOR.capabilities })
    expect(await screen.findByRole('button', { name: 'غیرفعال‌سازی کاربر' })).toBeInTheDocument()
  })

  it('gives every action its own horizontal padding and type size', async () => {
    // `Button`'s BASE carries neither on purpose (I5) — the call site owns both
    // — so a bare `<Button>` renders as a 44 px touch box with its text jammed
    // against the edges. jsdom measures nothing, so the class is the only thing
    // any runnable test can see, and a previous task shipped two such buttons
    // because nothing asserted it.
    //
    // The four are NAMED rather than swept up with `getAllByRole('button')`:
    // `PasswordField`'s reveal control is a 32px square sized by `--size-reveal`
    // and owns neither by design, so a loop would have to be weakened to admit
    // it — which is how a guard comes to assert nothing. Naming them also makes
    // the list a statement of which actions §6.8 draws.
    renderDetail(EDITOR, SAHAR)
    await screen.findByRole('button', { name: 'غیرفعال‌سازی کاربر' })
    for (const name of ['ویرایش', 'تغییر سرپرست', 'ثبت گذرواژه', 'غیرفعال‌سازی کاربر']) {
      const b = screen.getByRole('button', { name })
      expect(b.className, `«${name}» has no horizontal padding`).toMatch(/(^|\s)px-[a-z]/)
      expect(b.className, `«${name}» sets no type size`).toMatch(/(^|\s)text-fs-[a-z0-9]+\b/)
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
    const { seen } = renderDetail(EDITOR, SAHAR)
    await userEvent.click(await screen.findByRole('button', { name: 'غیرفعال‌سازی کاربر' }))
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].path).toBe('/api/users/7/disabled')
    expect(seen.writes[0].body).toEqual({ disabled: true })
    // The danger card carries the state now that the pill is gone: its heading
    // and its button both flip to the other direction, and they can only do
    // that if the screen re-read the row the stub really stored.
    expect(await screen.findByRole('button', { name: 'فعال‌سازی کاربر' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'غیرفعال‌سازی کاربر' })).toBeNull()
  })

  it('re-enables in the other direction, sending false', async () => {
    // One endpoint, both verbs (D14). A screen hardcoding `true` disables an
    // account that was already disabled and reports success.
    const { seen } = renderDetail(EDITOR, NADER)
    await userEvent.click(await screen.findByRole('button', { name: 'فعال‌سازی کاربر' }))
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body).toEqual({ disabled: false })
    expect(await screen.findByRole('button', { name: 'غیرفعال‌سازی کاربر' })).toBeInTheDocument()
  })

  it('repeats the server\'s own sentence when the write is refused, and keeps the stored state', async () => {
    // The client cannot re-derive every refusal — the last-active-Editor guard
    // counts rows this screen never sees — so a refusal that reaches here is one
    // the drawn controls could not have predicted. Its Persian sentence is
    // written for this administrator and names something they can act on;
    // «انجام نشد» in its place throws that away.
    renderDetail(EDITOR, SAHAR, {
      writeStatus: 403,
      writeDetail: 'این تنها ویرایشگر فعال سامانه است و دسترسی‌اش را نمی‌توان برداشت',
    })
    await userEvent.click(await screen.findByRole('button', { name: 'غیرفعال‌سازی کاربر' }))
    expect(await screen.findByRole('alert'))
      .toHaveTextContent('این تنها ویرایشگر فعال سامانه است و دسترسی‌اش را نمی‌توان برداشت')
    // The write did not land, so the card still offers the direction it did.
    expect(screen.getByRole('button', { name: 'غیرفعال‌سازی کاربر' })).toBeInTheDocument()
  })

  it('does not put a framework\'s English on a Persian screen when a 4xx carries no sentence', async () => {
    // The server's own refusals are echoed because each is a Persian sentence
    // naming something to do next — but "4xx" is not a promise that one was
    // written. FastAPI's validation layer answers 422 with `detail` as a
    // **list**, which `fetchJson` cannot read a sentence out of, so it falls
    // back to `res.statusText`: «Unprocessable Entity», in English, in an alert,
    // to a Persian-speaking administrator. Same for a proxy-generated 429 or 413
    // with no JSON body at all.
    renderDetail(EDITOR, SAHAR, {
      writeStatus: 422,
      writeDetail: [{ type: 'bool_parsing', loc: ['body', 'disabled'],
                      msg: 'Input should be a valid boolean' }],
      statusText: 'Unprocessable Entity',
    })
    await userEvent.click(await screen.findByRole('button', { name: 'غیرفعال‌سازی کاربر' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('انجام نشد؛ دوباره تلاش کنید.')
    expect(screen.queryByText(/Unprocessable Entity/)).toBeNull()
    expect(screen.queryByText(/valid boolean/)).toBeNull()
  })

  it('says the same for a 5xx, whose detail is English by construction', async () => {
    // An unhandled exception behind FastAPI answers `{"detail": "Internal Server
    // Error"}` — a `detail` that *is* a string, and still not a sentence written
    // for anybody. A 5xx is not a refusal at all, so it never speaks for the
    // server; widening the echo to "any ApiError" puts this on the screen.
    renderDetail(EDITOR, SAHAR, {
      writeStatus: 500, writeDetail: 'Internal Server Error',
      statusText: 'Internal Server Error',
    })
    await userEvent.click(await screen.findByRole('button', { name: 'غیرفعال‌سازی کاربر' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('انجام نشد؛ دوباره تلاش کنید.')
    expect(screen.queryByText(/Internal Server Error/)).toBeNull()
    // The write did not land, so the stored state is what is still drawn.
    expect(screen.getByRole('button', { name: 'غیرفعال‌سازی کاربر' })).toBeInTheDocument()
  })

  it('says nothing about failure while everything is succeeding', async () => {
    // The alert must be the consequence of a refusal, not furniture that is
    // always in the DOM — which would pass the test above for the wrong reason.
    renderDetail(EDITOR, SAHAR)
    await userEvent.click(await screen.findByRole('button', { name: 'غیرفعال‌سازی کاربر' }))
    expect(await screen.findByRole('button', { name: 'فعال‌سازی کاربر' })).toBeInTheDocument()
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
    //
    // Stated UNDER the control rather than in a detached `role="alert"`: §4.6
    // has no field-level error style — errors are stated in copy — and
    // `PasswordField` binds that line to the input with `aria-describedby` and
    // marks it `aria-invalid`, so a screen reader that lands in the field is
    // told what is wrong with the field it is in. The alert this replaces sat
    // outside the control and named nothing.
    const { seen } = renderDetail(EDITOR, SAHAR)
    const field = await screen.findByLabelText('گذرواژهٔ تازه')
    await userEvent.type(field, 'five5')
    await userEvent.click(screen.getByRole('button', { name: 'ثبت گذرواژه' }))
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'))
    const described = field.getAttribute('aria-describedby')
    expect(described, 'the floor is stated in a line the field does not point at')
      .not.toBeNull()
    expect(document.getElementById(described!))
      .toHaveTextContent('گذرواژه باید دست‌کم ۶ نویسه باشد')
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

describe('the record screen (§6.8)', () => {
  it('goes back with a drawn chevron, not a unicode arrow pointing away', async () => {
    renderDetail(EDITOR, SAHAR)
    const back = await screen.findByRole('link', { name: 'فهرست کاربران' })
    // §5.2 iconography bans unicode-glyph icons outright; the two sanctioned
    // exceptions are `⣿` and the ICOM arrows, and a back arrow is neither.
    expect(back.textContent).not.toMatch(/[←→]/)
    const svg = back.querySelector('svg')
    expect(svg).not.toBeNull()
    // §8 — "back" is `M9 18l6-6-6-6`: toward the start of the reading
    // direction, which in RTL is rightward. `←` was drawn pointing away from
    // where the link goes. `ICONS.chevronStart` is that path, and it is the
    // one the deliverable's own «بازگشت» button draws (`Inja Panel.dc.html:177`).
    expect(svg!.querySelector('path')!.getAttribute('d')).toBe('M9 18l6-6-6-6')
    expect(svg!.getAttribute('stroke-width')).toBe('2.4')
    // F14 — it was a 17px-tall hit target with no hover.
    expect(back).toHaveClass('min-h-touch')
  })

  it('names the department the account reaches, not the key it is stored under', async () => {
    renderDetail(EDITOR, { ...SAHAR, scopes: ['dept:dining', 'dept:cashier/report:steps'] })
    const panel = await screen.findByRole('group', { name: 'نقش و دپارتمان' })
    expect(within(panel).getByText('سالن')).toBeInTheDocument()
    expect(within(panel).getByText('صندوق (فقط راهنمای گام‌به‌گام)')).toBeInTheDocument()
    expect(within(panel).queryByText(/dept:/)).toBeNull()
  })

  it('quotes a scope the grammar refuses rather than prettifying it away', async () => {
    // Its own test rather than a second `renderDetail` inside the one above:
    // two mounts in one test leave both records in the document, and every
    // `screen.*` query then reads across a page nobody drew.
    //
    // An account covered by nothing must not read as an account covered by a
    // department (`lib/scopes.ts`, `ParsedScope.refused`) — `user_scopes.scope`
    // is `TEXT NOT NULL` with no CHECK, so such a row is storable today.
    renderDetail(EDITOR, { ...SAHAR, scopes: ['nonsense'] })
    const panel = await screen.findByRole('group', { name: 'نقش و دپارتمان' })
    expect(within(panel).getByText('nonsense')).toBeInTheDocument()
  })

  it('says so, rather than nothing, for an account with no scope row at all', async () => {
    renderDetail(EDITOR, { ...SAHAR, scopes: [] })
    const panel = await screen.findByRole('group', { name: 'نقش و دپارتمان' })
    expect(within(panel).getByText('هیچ دامنه‌ای')).toBeInTheDocument()
  })

  it('draws nothing at all where a viewer may not act, and explains nothing (R5)', async () => {
    // ADMIN holds `manage_users` without `manage_peers`, and this target confers
    // `edit`, which they do not hold — so the subset rule refuses them and
    // `mayManage` is false. The refusal depends on the TARGET, not the caller,
    // and R5 does not bend for that: absent, not explained.
    renderDetail(ADMIN, { ...SAHAR, capabilities: [...ADMIN.capabilities, 'edit'] })
    expect(await screen.findByRole('heading', { name: 'سحر بیات' })).toBeInTheDocument()
    // The three manage panels are absent — not disabled, not explained.
    expect(screen.queryByRole('button', { name: 'ویرایش' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'تغییر سرپرست' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'گذرواژه' })).toBeNull()
    expect(screen.queryByRole('group', { name: /غیرفعال‌سازی/ })).toBeNull()
    expect(screen.queryByText(/دسترسی این حساب از دسترسی شما بیشتر است/)).toBeNull()
    // What stays is what everybody who reaches this surface may read.
    expect(screen.getByRole('group', { name: 'نقش و دپارتمان' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'سرپرست' })).toBeInTheDocument()
  })

  it('says nothing on your own record either — the profile is in the nav (R5)', async () => {
    renderDetail(EDITOR, { ...SAHAR, username: EDITOR.username })
    await screen.findByRole('heading', { name: 'سحر بیات' })
    expect(screen.queryByText(/حساب خودتان را از این صفحه/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'ویرایش' })).toBeNull()
  })

  it('stacks the design\'s four panels, in order, with the danger card last', async () => {
    renderDetail(EDITOR, {
      ...SAHAR,
      supervisor: { id: 21, username: '09123333333', displayName: 'مریم رستمی', disabled: true },
    })
    const groups = await screen.findAllByRole('group')
    expect(groups.map((g) => g.getAttribute('aria-label')))
      .toEqual(['نقش و دپارتمان', 'سرپرست', 'گذرواژه', 'غیرفعال‌سازی کاربر'])
    const sup = screen.getByRole('group', { name: 'سرپرست' })
    expect(within(sup).getByText('مریم رستمی')).toBeInTheDocument()
    expect(within(sup).getByText(
      'این سرپرست غیرفعال است — کامنت‌های این کاربر یک پله بالاتر می‌روند.')).toBeInTheDocument()
    expect(within(sup).getByRole('button', { name: 'تغییر سرپرست' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'گذرواژه' }))
      .getByRole('heading', { name: 'بازنشانی گذرواژهٔ سحر بیات' })).toBeInTheDocument()
    // §5.2's destructive ghost: `--tile-c2` under `--conflict`. The deliverable
    // binds the SAME skin in both directions — re-enabling restores
    // capabilities, so it is exactly as consequential as disabling.
    expect(screen.getByRole('button', { name: 'غیرفعال‌سازی کاربر' }))
      .toHaveClass('bg-tile-c2', 'text-conflict')
  })

  it('hooks the measurement points on the elements the harness row means', async () => {
    // `expectDesign` resolves each hook as the FIRST match inside
    // `[data-screen="access"]`, and a hook on the wrong element grades that
    // element and reports GREEN — which is worse than omitting it. jsdom paints
    // nothing, so what a runnable test can hold is which element carries which
    // attribute; the values are the Playwright check's.
    renderDetail(EDITOR, SAHAR)
    const screenRoot = document.querySelector('[data-screen="access"]')!
    expect(screenRoot).not.toBeNull()
    // [data-col] is the 820px column, not the scrolling root.
    expect(screenRoot.querySelector('[data-col]')!.className).toContain('max-w-access')
    // [data-h1] is the <h1> itself.
    expect(screenRoot.querySelector('[data-h1]')!.tagName).toBe('H1')
    expect(screenRoot.querySelector('[data-h1]')!.textContent).toBe('سحر بیات')
    // [data-body] is the mono username — the one hook the row exempts from
    // `rtl`. On the wrapper instead, the exemption would stop describing
    // anything while the column and the title stayed held to `rtl`.
    const body = screenRoot.querySelector('[data-body]')!
    expect(body.getAttribute('dir')).toBe('ltr')
    expect(body.textContent).toBe('09121111111')
    // [data-card] is panel 1, and there is exactly one of them: a second would
    // be measured by nothing while claiming to be measured.
    const cards = screenRoot.querySelectorAll('[data-card]')
    expect(cards).toHaveLength(1)
    expect(cards[0].getAttribute('aria-label')).toBe('نقش و دپارتمان')
    // `access` carries no `grid`, so no grid hook goes on this screen.
    expect(screenRoot.querySelectorAll('[data-grid]')).toHaveLength(0)
  })
})
