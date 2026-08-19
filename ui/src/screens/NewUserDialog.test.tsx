import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CANDIDATES_UNREADABLE, DEPARTMENTS_UNREADABLE, ROLES_UNREADABLE } from '../lib/userDraft'
import { EVERY_DEPARTMENT } from '../lib/scopes'
import { Users } from './Users'
import type { AdminUser, Role, SupervisorCandidate } from '../api/users'
import type { SessionDescriptor } from '../auth/session'

let session: SessionDescriptor | undefined
vi.mock('../auth/useSession', () => ({ useSession: () => ({ data: session }) }))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const JSON_HEAD = { 'Content-Type': 'application/json' }
const json = (body: unknown, status = 200, statusText = '') =>
  new Response(JSON.stringify(body), { status, statusText, headers: JSON_HEAD })

/** An Admin: `manage_users` without `manage_peers`, so the subset rule is
 *  strict. Everything below is drawn for this actor unless it says otherwise. */
const ADMIN: SessionDescriptor = {
  username: '09129999999', displayName: 'کامران راد', role: 'admin',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users'],
  scopes: ['*'], supervisor: null, canSupervise: true, pendingApprovals: 0,
}

const DEPARTMENTS = [
  { code: 'warehouse', name: 'انبار', count: 0, subs: 0 },
  { code: 'dining', name: 'سالن', count: 0, subs: 0 },
  { code: 'cashier', name: 'صندوق', count: 0, subs: 0 },
]

/**
 * What `GET /api/roles` answers this Admin — **already filtered, server-side**
 * (D56: a list endpoint never returns rows it then declines to render).
 * `editor` is absent because the server left it out, and `admin` is present
 * even though it confers exactly what this Admin holds: whether an equal may be
 * appointed is `manage_peers`' business and the server has already decided it.
 * A screen that re-derives the subset rule would drop `admin` here.
 *
 * The order is neither ascending nor descending by id or by name, so no
 * `.sort()` on either field can reproduce it.
 */
const ROLES: Role[] = [
  { id: 3, name: 'admin', capabilities: ['view', 'comment', 'export_pdf', 'manage_users'] },
  { id: 5, name: 'reader_no_download', capabilities: ['view', 'comment'] },
  { id: 4, name: 'reader', capabilities: ['view', 'comment', 'export_pdf'] },
]

const SAHAR: SupervisorCandidate = {
  id: 32, username: '09122222222', displayName: 'سحر بیات',
  scopes: ['dept:dining'], canSupervise: true,
}
/** The actor themselves, and eligible: the form defaults to them. */
const KAMRAN: SupervisorCandidate = {
  id: 30, username: ADMIN.username, displayName: 'کامران راد',
  scopes: ['*'], canSupervise: true,
}

const NADER: AdminUser = {
  id: 8, username: '09122222222', displayName: 'نادر قاسمی',
  roleId: 4, role: 'reader', capabilities: ['view'], scopes: ['dept:dining'],
  supervisor: null, canSupervise: false, disabled: false, createdAt: 1600000000,
}

/**
 * **A disabled account that carries the supervisor flag.** It is on
 * `/api/users` and deliberately not among the candidates the server returns —
 * `eligible_supervisors` reads liveness from the database — so a picker that
 * built its list by filtering the user list on `canSupervise` would offer this
 * person, and every choice of them would come back `not_eligible`.
 */
const BABAK: AdminUser = {
  id: 9, username: '09124444444', displayName: 'بابک آرام',
  roleId: 4, role: 'reader', capabilities: ['view'], scopes: ['*'],
  supervisor: null, canSupervise: true, disabled: true, createdAt: 1600000000,
}

interface Seen {
  gets: string[]
  writes: { path: string; method: string; body: Record<string, unknown> }[]
  /**
   * Replace what `/api/users/supervisor-candidates` answers **on the same
   * stub**. Calling `stubServer` a second time would install a second `fetch`
   * recording into a second `Seen`, and the `expect(seen.writes).toEqual([])`
   * that follows would then be true of an object nothing had written to — a
   * test whose input is not the shape its name claims.
   */
  setCandidates: (next: SupervisorCandidate[]) => void
  /** Answer every later candidate request never. The scopes change, the query
   *  key changes with them, and the new answer is `undefined` rather than an
   *  empty list — which is the state a slow or hung request really leaves the
   *  form in, and is not the same state as "nobody is eligible". */
  stallCandidates: () => void
  /** Stop failing whichever read `rolesStatus` / `candidatesStatus` was failing,
   *  so the retry the failure screen offers has something to succeed with. */
  healReads: () => void
}

function stubServer(opts: {
  users?: AdminUser[]
  roles?: Role[]
  candidates?: SupervisorCandidate[]
  /**
   * Answer `GET /api/roles` with this status instead of 200.
   *
   * **A failed read is not an empty answer.** In react-query v5 a failure is
   * `status: 'error'` with `data` undefined, so `data ?? []` renders it as a
   * genuinely empty list — and no test in any dialog suite set a non-200 on a
   * read until this option existed, which is why making either read always fail
   * left the whole frontend suite green.
   */
  rolesStatus?: number
  /** The same, for `GET /api/users/supervisor-candidates`. Separate, because the
   *  two produce different false claims. */
  candidatesStatus?: number
  /**
   * The same, for `GET /api/departments` — **the same defect one read further
   * out**, and the one no option in this file could reach until now.
   *
   * The scope fieldset draws one block per department out of this registry, so
   * a failure left the create form offering «همهٔ دپارتمان‌ها» and nothing
   * narrower: the only reach an account could be given was everything.
   */
  departmentsStatus?: number
  createStatus?: number
  createDetail?: unknown
  statusText?: string
} = {}): Seen {
  const rows = [...(opts.users ?? [NADER])]
  const roles = opts.roles ?? ROLES
  let candidates = opts.candidates ?? [SAHAR, KAMRAN]
  let stalled = false
  let rolesStatus = opts.rolesStatus ?? 200
  let candidatesStatus = opts.candidatesStatus ?? 200
  let departmentsStatus = opts.departmentsStatus ?? 200
  const seen: Seen = {
    gets: [], writes: [],
    setCandidates: (next) => { candidates = next },
    stallCandidates: () => { stalled = true },
    healReads: () => { rolesStatus = 200; candidatesStatus = 200; departmentsStatus = 200 },
  }
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      seen.writes.push({ path, method: init.method, body })
      const status = opts.createStatus ?? 201
      if (status >= 400) {
        return json({ detail: opts.createDetail ?? 'نه' }, status, opts.statusText)
      }
      const role = roles.find((r) => r.id === body.roleId)
      const created: AdminUser = {
        id: 500, username: String(body.username), displayName: String(body.displayName),
        roleId: Number(body.roleId), role: role?.name ?? null,
        capabilities: role?.capabilities ?? [], scopes: (body.scopes ?? []) as string[],
        supervisor: null, canSupervise: Boolean(body.canSupervise),
        disabled: false, createdAt: 1700000000,
      }
      rows.push(created)
      return json(created, 201)
    }
    seen.gets.push(path)
    if (path === '/api/users') return json([...rows])
    if (path === '/api/roles') {
      return rolesStatus === 200 ? json(roles) : json({ detail: 'نه' }, rolesStatus)
    }
    if (path === '/api/departments') {
      return departmentsStatus === 200 ? json(DEPARTMENTS) : json({ detail: 'نه' }, departmentsStatus)
    }
    if (path.startsWith('/api/users/supervisor-candidates')) {
      if (stalled) return new Promise<Response>(() => {})
      if (candidatesStatus !== 200) return json({ detail: 'نه' }, candidatesStatus)
      return json(candidates)
    }
    throw new Error(`unexpected request: ${path}`)
  }))
  return seen
}

function mountList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/users']}>
        <Routes><Route path="/users" element={<Users />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Open the dialog and wait for the role list — every field is drawn by then. */
async function openDialog() {
  await userEvent.click(await screen.findByRole('button', { name: 'کاربر جدید' }))
  await screen.findByRole('dialog')
  await waitFor(() => expect(screen.getByRole('option', { name: 'خواننده' })).toBeInTheDocument())
}

/** The one request the picker made, or a failure naming what was asked instead. */
function candidateQuery(seen: Seen): string {
  const hits = seen.gets.filter((p) => p.startsWith('/api/users/supervisor-candidates'))
  if (hits.length === 0) throw new Error('the picker asked for no candidates at all')
  return hits[hits.length - 1]
}

/** Everything the form needs before it will submit, done in one place so each
 *  test below changes exactly the one thing it is about. */
async function fillValidForm() {
  await userEvent.type(screen.getByLabelText('نام و نام خانوادگی'), 'نگار سلیمی')
  await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
  await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
  await chooseRole('خواننده')
  await userEvent.click(screen.getByRole('checkbox', { name: 'دپارتمان سالن' }))
}

/** By the option, never by its value: the value is the role **id**, so a string
 *  argument would silently match nothing and leave the select where it was. */
async function chooseRole(name: string) {
  // Scoped to the dialog: Task 19's filter bar draws its own «نقش» Dropdown on
  // the Users screen behind this one, so an unscoped query matches two.
  const select = within(screen.getByRole('dialog')).getByLabelText('نقش')
  await userEvent.selectOptions(select, within(select).getByRole('option', { name }))
}

function submit() {
  return userEvent.click(screen.getByRole('button', { name: 'ساخت کاربر' }))
}

beforeEach(() => { session = ADMIN })

describe('opening the create-user dialog', () => {
  it('asks the server for nothing until it is opened', async () => {
    // Roles, departments and candidates are three requests per page view for a
    // dialog nobody opened — and the candidate list depends on scopes that do
    // not exist yet, so the answer would be thrown away anyway.
    const seen = stubServer()
    mountList()
    await screen.findByRole('button', { name: 'کاربر جدید' })
    // Task 19's filter bar resolves department codes to Persian names, so the
    // screen reads the registry on mount. The claim under test is unchanged:
    // the DIALOG's own reads (roles, candidates) wait until it is opened.
    await waitFor(() => expect([...seen.gets].sort()).toEqual(['/api/departments', '/api/users']))
  })

  it('is not offered to somebody the surface itself refuses', async () => {
    // The screen is already answered 404 for a department-scoped caller; a
    // create button drawn above that refusal would be a control the app itself
    // put in front of a wall.
    stubServer()
    session = { ...ADMIN, scopes: ['dept:dining'] }
    mountList()
    expect(await screen.findByText('چیزی اینجا نیست')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'کاربر جدید' })).toBeNull()
  })
})

describe('the role picker on the create form', () => {
  it('offers exactly the roles the server returned, and re-filters nothing', async () => {
    // D56 — `/api/roles` is filtered server-side by the very rule that would
    // refuse the write, so offering less than it returned withholds a choice
    // this Admin really has. `admin` confers exactly what this Admin holds, so
    // a screen re-deriving the strict-subset rule locally would drop it.
    stubServer()
    mountList()
    await openDialog()
    const select = within(screen.getByRole('dialog')).getByLabelText('نقش')
    const offered = within(select).getAllByRole('option')
      .map((o) => o.textContent)
      .filter((t) => t !== 'انتخاب کنید')
    expect(offered).toEqual(['مدیر', 'خواننده بدون خروجی', 'خواننده'])
  })

  it('never offers a role the server left out', async () => {
    // The whole point of filtering on the server: an Admin offered `editor`
    // types a name, a number and a password and is refused at the end.
    stubServer()
    mountList()
    await openDialog()
    // Both spellings: the option is now drawn in Persian, so asking only about
    // the identifier would pass on a screen that offered «تحلیل‌گر».
    expect(screen.queryByRole('option', { name: 'تحلیل‌گر' })).toBeNull()
    expect(screen.queryByRole('option', { name: 'editor' })).toBeNull()
  })

  it('will not submit until a role is chosen, and spends no request finding out', async () => {
    const seen = stubServer()
    mountList()
    await openDialog()
    await userEvent.type(screen.getByLabelText('نام و نام خانوادگی'), 'نگار سلیمی')
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('نقش کاربر را انتخاب کنید')
    expect(seen.writes).toEqual([])
  })
})

describe('the supervisor picker on the create form', () => {
  it('asks for candidates covering every scope the new account will hold', async () => {
    // **The multi-scope case the spec singles out.** A user holding
    // `dept:dining` *and* `dept:cashier` can be supervised only by somebody who
    // covers both — in today's deployment a `*` holder. A form that sends the
    // first scope alone gets back a list of people who cover half of what this
    // account reaches, and every one of them looks eligible.
    const seen = stubServer()
    mountList()
    await openDialog()
    await userEvent.click(screen.getByRole('checkbox', { name: 'دپارتمان سالن' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'دپارتمان صندوق' }))
    await waitFor(() => {
      const q = candidateQuery(seen)
      expect(q).toContain('scope=dept%3Adining')
      expect(q).toContain('scope=dept%3Acashier')
    })
  })

  it('names no exclusion, because on this form there is no id to exclude', async () => {
    // `eligible_supervisors` takes `excluding` as a *required* keyword so that
    // omitting it is a decision. The create form's decision is `None`: there is
    // no account yet, so there is nobody to leave out.
    const seen = stubServer()
    mountList()
    await openDialog()
    await waitFor(() => expect(candidateQuery(seen)).not.toContain('exclude'))
  })

  it('offers only who the server offered — never a disabled account off the user list', async () => {
    // `eligible_supervisors` reads liveness from the database, and Babak is
    // disabled with the flag still set. He is on `/api/users` and not among the
    // candidates, so a picker sourcing its rows from the user list offers him
    // and every choice of him comes back `not_eligible`.
    stubServer({ users: [NADER, BABAK] })
    mountList()
    await openDialog()
    await waitFor(() => expect(screen.getByRole('radio', { name: /سحر بیات/ })).toBeInTheDocument())
    expect(screen.queryByRole('radio', { name: /بابک آرام/ })).toBeNull()
  })

  it('starts on the person creating the account, when the server offered them', async () => {
    stubServer()
    mountList()
    await openDialog()
    await waitFor(() => expect(screen.getByRole('radio', { name: /کامران راد/ })).toBeChecked())
  })

  it('refuses to submit with no supervisor for a user who does not reach everything (D51)', async () => {
    // The server's own sentence, and no request: a scoped account must have
    // somewhere for its comment approvals to go.
    const seen = stubServer({ candidates: [SAHAR] })
    mountList()
    await openDialog()
    await fillValidForm()
    // …and the choice is not even offered, because it is not a state this
    // account may be in. Offering it and then refusing it is worse than not
    // offering it.
    expect(screen.queryByRole('radio', { name: 'بدون سرپرست' })).toBeNull()
    await submit()
    expect(await screen.findByRole('alert'))
      .toHaveTextContent('برای کاربری که به همهٔ دپارتمان‌ها دسترسی ندارد باید سرپرست انتخاب کنید')
    expect(seen.writes).toEqual([])
  })

  it('lets a `*`-scoped account be created with none, sending an explicit null', async () => {
    // The other half. `supervisorId: null` is a *choice* here and the one field
    // on which the server reads null as a value.
    const seen = stubServer({ candidates: [SAHAR] })
    mountList()
    await openDialog()
    await userEvent.type(screen.getByLabelText('نام و نام خانوادگی'), 'نگار سلیمی')
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await chooseRole('خواننده')
    await userEvent.click(screen.getByRole('checkbox', { name: 'همهٔ دپارتمان‌ها' }))
    await userEvent.click(await screen.findByRole('radio', { name: 'بدون سرپرست' }))
    await submit()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body.scopes).toEqual(['*'])
    expect(seen.writes[0].body.supervisorId).toBeNull()
  })

  it('lets the creator be taken back off, rather than re-proposing themselves', async () => {
    // **The one input that separates "default once" from "default whenever
    // nothing is chosen".** The creator is eligible, so the field opens on
    // them; clearing it on a `*`-scoped account is a legal state (D51), and a
    // default that re-fires puts them straight back — silently, with the radio
    // moving under the administrator's hand — and the account is created with a
    // supervisor nobody chose.
    const seen = stubServer()
    mountList()
    await openDialog()
    await userEvent.type(screen.getByLabelText('نام و نام خانوادگی'), 'نگار سلیمی')
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await chooseRole('خواننده')
    await userEvent.click(screen.getByRole('checkbox', { name: 'همهٔ دپارتمان‌ها' }))
    await waitFor(() => expect(screen.getByRole('radio', { name: /کامران راد/ })).toBeChecked())
    await userEvent.click(screen.getByRole('radio', { name: 'بدون سرپرست' }))
    expect(screen.getByRole('radio', { name: 'بدون سرپرست' })).toBeChecked()
    expect(screen.getByRole('radio', { name: /کامران راد/ })).not.toBeChecked()
    await submit()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body.supervisorId).toBeNull()
  })

  it('will not submit a supervisor the server no longer offers', async () => {
    // Picked while the new account was scoped to the dining room, then the
    // scopes widened and the candidate list came back without them. Sending it
    // anyway earns a 400 that names somebody who is no longer even on screen.
    const seen = stubServer({ candidates: [SAHAR, KAMRAN] })
    mountList()
    await openDialog()
    await fillValidForm()
    await userEvent.click(await screen.findByRole('radio', { name: /سحر بیات/ }))
    // The server now offers nobody but the actor for these scopes.
    seen.setCandidates([KAMRAN])
    await userEvent.click(screen.getByRole('checkbox', { name: 'دپارتمان صندوق' }))
    await waitFor(() => expect(screen.queryByRole('radio', { name: /سحر بیات/ })).toBeNull())
    // …and it does **not** say the chosen supervisor stays where they are. That
    // note is for D14's edit case — an existing account whose edge nothing in
    // this save touches — and there is no account here at all: it would promise
    // that somebody remains the supervisor of a user who does not exist, on the
    // very choice the submit below is about to refuse. This is the only path in
    // this file that reaches an off-list value, so nothing else can catch it.
    expect(screen.queryByText(/سرپرست کنونی در این فهرست نیست/)).toBeNull()
    await submit()
    expect(await screen.findByRole('alert'))
      .toHaveTextContent('این شخص نمی‌تواند سرپرست این کاربر باشد')
    expect(seen.writes).toEqual([])
  })

  it('refuses nobody while the list it would check against is still in flight', async () => {
    // The same widening as the test above, except the new list never arrives.
    // «not on the list» and «there is no list yet» are different facts, and the
    // local check is a convenience (D48) that must never be a stricter gate than
    // the server: read as an empty list, an outstanding request refuses every
    // supervisor there is — Kamran, who holds `*`, included — and sends nothing,
    // so the administrator is left with a form that will not submit and no
    // sentence that explains it. The server decides this on every write anyway.
    const seen = stubServer()
    mountList()
    await openDialog()
    await fillValidForm()
    await userEvent.click(await screen.findByRole('radio', { name: /سحر بیات/ }))
    seen.stallCandidates()
    await userEvent.click(screen.getByRole('checkbox', { name: 'دپارتمان صندوق' }))
    await waitFor(() => expect(screen.queryByRole('radio', { name: /سحر بیات/ })).toBeNull())
    await submit()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body.supervisorId).toBe(32)
    expect(seen.writes[0].body.scopes).toEqual(['dept:dining', 'dept:cashier'])
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

/** One report box under «دپارتمان سالن». The department is in the accessible
 *  name because the same kinds are drawn under every department. */
const DINING_STEPS = 'دپارتمان سالن — فقط راهنمای گام‌به‌گام'

describe('the scope fieldset on the create form', () => {
  it('creates D11\'s «Report reader»: a Reader holding one report of one department', async () => {
    // **A real person in the deployment table who could not be created at all.**
    // The API accepts `dept:{code}/report:{kind}` — `_clean_scopes` and
    // `SCOPE_RE` have always taken it — and the four screens that reach it could
    // not send one, because the fieldset offered `*` and one box per department
    // and nothing narrower.
    const seen = stubServer()
    mountList()
    await openDialog()
    await userEvent.type(screen.getByLabelText('نام و نام خانوادگی'), 'رها فرجی')
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09126666666')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await chooseRole('خواننده')
    await userEvent.click(screen.getByRole('checkbox', { name: DINING_STEPS }))
    await userEvent.click(await screen.findByRole('radio', { name: /سحر بیات/ }))
    await submit()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body.scopes).toEqual(['dept:dining/report:steps'])
  })

  it('asks for candidates covering the report, which is a narrower question than the department', async () => {
    // `eligible_supervisors` is asked the scopes verbatim, and somebody who
    // covers only `dept:dining/report:steps` may supervise her while covering
    // less than the department. Asking about `dept:dining` returns fewer people
    // than really qualify.
    const seen = stubServer()
    mountList()
    await openDialog()
    await userEvent.click(screen.getByRole('checkbox', { name: DINING_STEPS }))
    await waitFor(() =>
      expect(candidateQuery(seen)).toContain('scope=dept%3Adining%2Freport%3Asteps'))
  })

  it('keeps «همهٔ دپارتمان‌ها» and a department mutually exclusive, in both directions', async () => {
    // **The rule the comment above `toggleEverything` states and nothing
    // tested.** Mutating it to `on ? [...draft.scopes, '*'] : draft.scopes` left
    // 785/785 green while making the box impossible to untick and storing
    // `['dept:dining', '*']` — no escalation, since the server checks coverage
    // and `*` covers everything, but a dead control and a redundant row would
    // have shipped in silence.
    const seen = stubServer()
    mountList()
    await openDialog()
    await userEvent.click(screen.getByRole('checkbox', { name: 'دپارتمان سالن' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'همهٔ دپارتمان‌ها' }))
    expect(screen.getByRole('checkbox', { name: 'همهٔ دپارتمان‌ها' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'دپارتمان سالن' })).not.toBeChecked()
    // …and it unticks again, which is the half the mutant above kills outright.
    await userEvent.click(screen.getByRole('checkbox', { name: 'همهٔ دپارتمان‌ها' }))
    expect(screen.getByRole('checkbox', { name: 'همهٔ دپارتمان‌ها' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'دپارتمان سالن' })).not.toBeChecked()

    // …and what reaches the wire is one scope, never two rows saying the same
    // thing. The mutant's body would be `['dept:dining', '*']`.
    await userEvent.type(screen.getByLabelText('نام و نام خانوادگی'), 'نگار سلیمی')
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await chooseRole('خواننده')
    await userEvent.click(screen.getByRole('checkbox', { name: 'دپارتمان سالن' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'همهٔ دپارتمان‌ها' }))
    await userEvent.click(await screen.findByRole('radio', { name: /کامران راد/ }))
    await submit()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body.scopes).toEqual(['*'])
  })

  it('clears a report narrowing too when «همهٔ دپارتمان‌ها» is ticked', async () => {
    // The same rule one level down: `*` covers `dept:x/report:k` as well, so a
    // draft holding both would store the same reach twice.
    stubServer()
    mountList()
    await openDialog()
    await userEvent.click(screen.getByRole('checkbox', { name: DINING_STEPS }))
    expect(screen.getByRole('checkbox', { name: DINING_STEPS })).toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: 'همهٔ دپارتمان‌ها' }))
    expect(screen.getByRole('checkbox', { name: DINING_STEPS })).not.toBeChecked()
  })
})

describe('when one of the create dialog\'s own reads fails', () => {
  /** Opened without waiting for a role option — when the failing read is
   *  `/api/roles` there is none to wait for. */
  async function openFailedDialog() {
    await userEvent.click(await screen.findByRole('button', { name: 'کاربر جدید' }))
    await screen.findByRole('dialog')
  }

  it('says the supervisor list did not load, instead of announcing that nobody may supervise this account', async () => {
    // `candidates.data ?? []` turns a 500 into an empty list, and the picker
    // then advises an administrator to narrow the scope of an account that does
    // not exist yet — a claim about the installation with nothing behind it.
    stubServer({ candidatesStatus: 500 })
    mountList()
    await openFailedDialog()
    expect(await screen.findByText(CANDIDATES_UNREADABLE)).toBeInTheDocument()
    expect(screen.queryByText(/کسی نمی‌تواند سرپرست این کاربر باشد/)).toBeNull()
  })

  it('says the role list did not load, instead of a form that refuses every submit', async () => {
    // With `/api/roles` failing the select held «انتخاب کنید» alone and every
    // press of «ساخت کاربر» came back «نقش کاربر را انتخاب کنید» — about the one
    // field nothing could be put into, after a name, a number and a password.
    stubServer({ rolesStatus: 500 })
    mountList()
    await openFailedDialog()
    expect(await screen.findByText(ROLES_UNREADABLE)).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).queryByLabelText('نقش')).toBeNull()
    expect(screen.queryByRole('button', { name: 'ساخت کاربر' })).toBeNull()
  })

  it('offers a retry, and draws the form once the read succeeds', async () => {
    const seen = stubServer({ rolesStatus: 500 })
    mountList()
    await openFailedDialog()
    await screen.findByText(ROLES_UNREADABLE)
    seen.healReads()
    await userEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByRole('option', { name: 'خواننده' })).toBeInTheDocument()
  })

  it('says the department registry did not load, instead of offering «everything» as the only reach', async () => {
    // **The third read, and the same defect one further out.** The fieldset
    // draws one block per department out of `/api/departments`, so a 500 left
    // exactly two boxes on the form — «همهٔ دپارتمان‌ها» and «می‌تواند سرپرست
    // دیگران باشد» — and said nothing about why. On the create form that is not
    // merely a wrong picture: the only reach an account could then be given was
    // everything, and «همهٔ دپارتمان‌ها» is the one grant that also switches
    // «بدون سرپرست» on (D51). An administrator who wanted a dining-room reader
    // is offered the `*` box and no other way through the form.
    stubServer({ departmentsStatus: 500 })
    mountList()
    await openFailedDialog()
    expect(await screen.findByText(DEPARTMENTS_UNREADABLE)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: EVERY_DEPARTMENT })).toBeNull()
    expect(screen.queryByRole('button', { name: 'ساخت کاربر' })).toBeNull()
  })

  it('retries the department registry too, and draws its boxes once it arrives', async () => {
    // The retry has to refetch the read that failed — a query sitting in `error`
    // refetches on nothing but being asked — and the departments themselves are
    // what has to come back, not merely the form around them.
    const seen = stubServer({ departmentsStatus: 500 })
    mountList()
    await openFailedDialog()
    await screen.findByText(DEPARTMENTS_UNREADABLE)
    seen.healReads()
    await userEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByRole('checkbox', { name: 'دپارتمان سالن' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: DINING_STEPS })).toBeInTheDocument()
  })
})

describe('the number and the password on the create form', () => {
  it('is a numeric telephone field pinned to latin order', async () => {
    stubServer()
    mountList()
    await openDialog()
    const field = screen.getByLabelText('شمارهٔ موبایل')
    expect(field).toHaveAttribute('type', 'tel')
    expect(field).toHaveAttribute('inputMode', 'numeric')
    expect(field).toHaveAttribute('dir', 'ltr')
  })

  it('does not cap the field short enough to store a different number than was typed', async () => {
    // Asserted on the attribute, not by typing: jsdom does not enforce
    // `maxLength` at all, so a cap that truncates «+98 0912 345 6789» into a
    // *different, valid* number is invisible to every runnable test.
    stubServer()
    mountList()
    await openDialog()
    const cap = screen.getByLabelText('شمارهٔ موبایل').getAttribute('maxLength')
    expect(cap === null || Number(cap) >= 20).toBe(true)
  })

  it('normalises the number before sending it (D57)', async () => {
    // Nine spellings land on one string. Sent unfolded, «۰۹۱۲…» is a different
    // username from the same number typed on a latin keyboard, and one person
    // occupies two accounts.
    const seen = stubServer()
    mountList()
    await openDialog()
    await userEvent.type(screen.getByLabelText('نام و نام خانوادگی'), 'نگار سلیمی')
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '+98 ۰۹۱۲ 345 6789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await chooseRole('خواننده')
    await userEvent.click(screen.getByRole('checkbox', { name: 'دپارتمان سالن' }))
    await userEvent.click(await screen.findByRole('radio', { name: /سحر بیات/ }))
    await submit()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body.username).toBe('09123456789')
  })

  it('refuses a number that is not a mobile number, without a request', async () => {
    const seen = stubServer()
    mountList()
    await openDialog()
    await userEvent.type(screen.getByLabelText('نام و نام خانوادگی'), 'نگار سلیمی')
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '021 88 99 77 66')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await chooseRole('خواننده')
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('شمارهٔ موبایل معتبر نیست')
    expect(seen.writes).toEqual([])
  })

  it('masks the password field', async () => {
    stubServer()
    mountList()
    await openDialog()
    expect(screen.getByLabelText('گذرواژه')).toHaveAttribute('type', 'password')
  })

  it('refuses a password under six characters without spending an argon2 hash on it', async () => {
    // The server's floor is six (D58), and `POST /api/users` computes a ~61 ms
    // hash on the shared verify limiter before it can say so.
    const seen = stubServer()
    mountList()
    await openDialog()
    await userEvent.type(screen.getByLabelText('نام و نام خانوادگی'), 'نگار سلیمی')
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'five5')
    await chooseRole('خواننده')
    await userEvent.click(screen.getByRole('checkbox', { name: 'دپارتمان سالن' }))
    await userEvent.click(await screen.findByRole('radio', { name: /سحر بیات/ }))
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('گذرواژه باید دست‌کم ۶ نویسه باشد')
    expect(seen.writes).toEqual([])
  })

  it('refuses a nameless account without a request', async () => {
    const seen = stubServer()
    mountList()
    await openDialog()
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await chooseRole('خواننده')
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('نام کاربر را بنویسید')
    expect(seen.writes).toEqual([])
  })
})

describe('creating the account', () => {
  it('sends every field the endpoint takes, and a null on none of them', async () => {
    // `null` is a 400 on `username`, `displayName`, `roleId`, `scopes` and
    // `canSupervise` — five fields on which the server reads it as "a form that
    // lost its value". Only `supervisorId` may carry one, and here it does not.
    const seen = stubServer()
    mountList()
    await openDialog()
    await fillValidForm()
    await userEvent.click(await screen.findByRole('radio', { name: /سحر بیات/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'می‌تواند سرپرست دیگران باشد' }))
    await submit()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].path).toBe('/api/users')
    expect(seen.writes[0].method).toBe('POST')
    expect(seen.writes[0].body).toEqual({
      username: '09123456789', displayName: 'نگار سلیمی', password: 'sixchars',
      roleId: 4, scopes: ['dept:dining'], supervisorId: 32, canSupervise: true,
    })
  })

  it('puts the new account on the list without a reload', async () => {
    // The write lands and the screen keeps drawing the list from before it. The
    // stub really appends its row, so only a screen that re-reads can show the
    // new person — and an administrator who cannot see the account they just
    // created makes it a second time.
    stubServer()
    mountList()
    // A table since Task 19: one body row, plus the header row.
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2))
    await openDialog()
    await fillValidForm()
    await userEvent.click(await screen.findByRole('radio', { name: /سحر بیات/ }))
    await submit()
    // Two body rows now, plus the header — and the new account is the second
    // body row, so it is index 2 among all rows.
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(3))
    expect(within(screen.getAllByRole('row')[2]).getByText('نگار سلیمی')).toBeInTheDocument()
  })

  it('closes the dialog once the account exists', async () => {
    stubServer()
    mountList()
    await openDialog()
    await fillValidForm()
    await userEvent.click(await screen.findByRole('radio', { name: /سحر بیات/ }))
    await submit()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('repeats the server\'s own sentence when the create is refused, and stays open', async () => {
    // «این شماره از پیش ثبت شده است» names the thing to do next; «انجام نشد» in
    // its place leaves an administrator pressing the same button. Closing the
    // dialog on a refusal would additionally throw away everything they typed.
    stubServer({ createStatus: 409, createDetail: 'این شماره از پیش ثبت شده است' })
    mountList()
    await openDialog()
    await fillValidForm()
    await userEvent.click(await screen.findByRole('radio', { name: /سحر بیات/ }))
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('این شماره از پیش ثبت شده است')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not put a framework\'s English on a Persian screen when a 4xx carries no sentence', async () => {
    // FastAPI's validation layer answers 422 with `detail` as a **list**, which
    // `fetchJson` cannot read a sentence out of, so it falls back to
    // `res.statusText` — «Unprocessable Entity», in English, in an alert.
    stubServer({
      createStatus: 422,
      createDetail: [{ type: 'int_parsing', loc: ['body', 'roleId'], msg: 'Input should be a valid integer' }],
      statusText: 'Unprocessable Entity',
    })
    mountList()
    await openDialog()
    await fillValidForm()
    await userEvent.click(await screen.findByRole('radio', { name: /سحر بیات/ }))
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('انجام نشد؛ دوباره تلاش کنید.')
    expect(screen.queryByText(/Unprocessable Entity/)).toBeNull()
  })

  it('says nothing about failure while everything is succeeding', async () => {
    // The alert must be the consequence of a refusal, not furniture that is
    // always in the DOM.
    stubServer()
    mountList()
    await openDialog()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('gives every control its own horizontal padding and type size', async () => {
    // `Button`'s BASE carries neither on purpose (I5) — the call site owns both
    // — so a bare `<Button>` is a 44 px touch box with its text against the
    // edges. jsdom measures nothing, so the class is all any runnable test sees.
    stubServer()
    mountList()
    await openDialog()
    // Icon-only controls are excluded: `IconButton` is a min-w-touch square
    // whose whole content is an svg, so horizontal padding would do nothing.
    const labelled = screen.getAllByRole('button').filter((b) => (b.textContent ?? '').trim() !== '')
    expect(labelled.length).toBeGreaterThan(1)
    for (const b of labelled) {
      expect(b.className, `«${b.textContent}» has no horizontal padding`).toMatch(/(^|\s)px-/)
      expect(b.className, `«${b.textContent}» sets no type size`).toMatch(/(^|\s)text-(caption|body|subtitle|fs-[a-z0-9]+)\b/)
    }
  })
})
