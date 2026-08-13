import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { UserDetail } from './UserDetail'
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

/** An Editor holding every capability, scoped `*` — so `mayManage` is true for
 *  every fixture below and the controls are drawn. */
const EDITOR: SessionDescriptor = {
  username: '09120000000', displayName: 'ویدا مهرآیین', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers',
                 'view_audit', 'edit', 'confirm', 'set_visibility'],
  scopes: ['*'], supervisor: null, canSupervise: false, pendingApprovals: 0,
}

/** An Admin, for the one case where the controls must NOT be drawn. */
const ADMIN: SessionDescriptor = {
  ...EDITOR, username: '09129999999', displayName: 'کامران راد', role: 'admin',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users'],
}

const DEPARTMENTS = [
  { code: 'cooking', name: 'پخت', count: 0, subs: 0 },
  { code: 'dining', name: 'سالن', count: 0, subs: 0 },
  { code: 'cashier', name: 'صندوق', count: 0, subs: 0 },
]

const ROLES: Role[] = [
  { id: 3, name: 'admin', capabilities: ['view', 'comment', 'export_pdf', 'manage_users'] },
  { id: 5, name: 'reader_no_download', capabilities: ['view', 'comment'] },
  { id: 4, name: 'reader', capabilities: ['view', 'comment', 'export_pdf'] },
]

/**
 * **Her supervisor is disabled and is therefore not a candidate.** D14 refuses
 * to repoint subordinates when a supervisor is disabled — the gap is surfaced
 * instead — so an edit form really does open on a supervisor the picker cannot
 * offer, and what the form does with that is the subject of a test below.
 */
const SAHAR: AdminUser = {
  id: 7, username: '09121111111', displayName: 'سحر بیات',
  roleId: 4, role: 'reader', capabilities: ['view', 'comment', 'export_pdf'],
  scopes: ['dept:cooking'],
  supervisor: { id: 21, username: '09123333333', displayName: 'مریم رستمی', disabled: true },
  canSupervise: false, disabled: false, createdAt: 1700000000,
}

/** Reaches everything, so «بدون سرپرست» is a legal choice for her (D51). */
const HOMA: AdminUser = {
  id: 9, username: '09125555555', displayName: 'هما نیک‌روش',
  roleId: 3, role: 'admin', capabilities: ['view', 'comment', 'export_pdf', 'manage_users'],
  scopes: ['*'],
  supervisor: { id: 33, username: '09123333333', displayName: 'کیوان مرادی', disabled: false },
  canSupervise: true, disabled: false, createdAt: 1700000000,
}

const KEYVAN: SupervisorCandidate = {
  id: 33, username: '09123333333', displayName: 'کیوان مرادی',
  scopes: ['*'], canSupervise: false,
}
const ARASH: SupervisorCandidate = {
  id: 31, username: '09121212121', displayName: 'آرش تهرانی',
  scopes: ['dept:cooking'], canSupervise: true,
}

interface Seen {
  gets: string[]
  writes: { path: string; method: string; body: Record<string, unknown> }[]
}

/**
 * A server that holds the row, so a write is visible to the read that follows
 * it. A screen that never invalidates keeps drawing the pre-write state and is
 * caught here — which is the whole reason the row is stored rather than a fixed
 * body being answered twice.
 */
function stubServer(user: AdminUser, opts: {
  candidates?: SupervisorCandidate[]
  writeStatus?: number
  writeDetail?: unknown
  statusText?: string
} = {}): Seen {
  let row = { ...user }
  const candidates = opts.candidates ?? [KEYVAN, ARASH]
  const seen: Seen = { gets: [], writes: [] }
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      seen.writes.push({ path, method: init.method, body })
      const status = opts.writeStatus ?? 200
      if (status >= 400) return json({ detail: opts.writeDetail ?? 'نه' }, status, opts.statusText)
      if ('displayName' in body) row = { ...row, displayName: String(body.displayName) }
      if ('scopes' in body) row = { ...row, scopes: body.scopes as string[] }
      if ('canSupervise' in body) row = { ...row, canSupervise: Boolean(body.canSupervise) }
      if ('supervisorId' in body) {
        const id = body.supervisorId as number | null
        const c = candidates.find((x) => x.id === id)
        row = {
          ...row,
          supervisor: c ? { id: c.id, username: c.username, displayName: c.displayName, disabled: false } : null,
        }
      }
      return json(row)
    }
    seen.gets.push(path)
    if (path === '/api/roles') return json(ROLES)
    if (path === '/api/departments') return json(DEPARTMENTS)
    if (path.startsWith('/api/users/supervisor-candidates')) return json(candidates)
    if (path === `/api/users/${row.id}`) return json(row)
    throw new Error(`unexpected request: ${path}`)
  }))
  return seen
}

function mountDetail(id: number) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/users/${id}`]}>
        <Routes><Route path="/users/:id" element={<UserDetail />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openDialog() {
  await userEvent.click(await screen.findByRole('button', { name: 'ویرایش کاربر' }))
  await screen.findByRole('dialog')
  await waitFor(() => expect(screen.getByRole('option', { name: 'reader' })).toBeInTheDocument())
}

function save() {
  return userEvent.click(screen.getByRole('button', { name: 'ثبت تغییرات' }))
}

function candidateQuery(seen: Seen): string {
  const hits = seen.gets.filter((p) => p.startsWith('/api/users/supervisor-candidates'))
  if (hits.length === 0) throw new Error('the picker asked for no candidates at all')
  return hits[hits.length - 1]
}

/** Every field on which the server answers 400 to an explicit `null`. */
const NEVER_NULL = ['username', 'displayName', 'roleId', 'scopes', 'canSupervise']

beforeEach(() => { session = EDITOR })

describe('who may edit a record', () => {
  it('offers the control to an administrator who may act on this account', async () => {
    stubServer(SAHAR)
    mountDetail(7)
    expect(await screen.findByRole('button', { name: 'ویرایش کاربر' })).toBeInTheDocument()
  })

  it('withholds it from an Admin looking at an account that confers more than they hold', async () => {
    // The subset rule (D13). Every write from here comes back NOT_A_SUBSET, so
    // a dialog drawn for this administrator is a form they cannot submit.
    session = ADMIN
    stubServer({ ...SAHAR, capabilities: EDITOR.capabilities })
    mountDetail(7)
    expect(await screen.findByRole('heading', { name: 'سحر بیات' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ویرایش کاربر' })).toBeNull()
  })

  it('asks the server for nothing until the dialog is opened', async () => {
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await screen.findByRole('button', { name: 'ویرایش کاربر' })
    await waitFor(() => expect(seen.gets).toEqual(['/api/users/7']))
  })
})

describe('the supervisor picker on the edit form', () => {
  it('names this very user as an exclusion, so nobody is offered themselves', async () => {
    // `eligible_supervisors` takes `excluding` as a required keyword precisely
    // because making it optional let a caller silently offer somebody
    // themselves — which `supervisor_error` then refuses as the one entry the
    // form made look reasonable.
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await waitFor(() => expect(candidateQuery(seen)).toContain('exclude=7'))
  })

  it('asks for candidates covering every scope the account will hold', async () => {
    // Widened to two departments, only somebody covering both may supervise.
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await userEvent.click(screen.getByRole('checkbox', { name: 'دپارتمان صندوق' }))
    await waitFor(() => {
      const q = candidateQuery(seen)
      expect(q).toContain('scope=dept%3Acooking')
      expect(q).toContain('scope=dept%3Acashier')
    })
  })

  it('leaves a supervisor the picker cannot offer exactly where they are (D14)', async () => {
    // Sahar's supervisor is disabled, so she is not a candidate — and D14 says
    // the edge stays and the gap is surfaced rather than the subordinate being
    // repointed. A form that "tidied up" the unselectable value would send
    // `supervisorId: null` alongside a display-name change and silently
    // un-parent her, which is the write nobody asked for.
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await userEvent.clear(screen.getByLabelText('نام و نام خانوادگی'))
    await userEvent.type(screen.getByLabelText('نام و نام خانوادگی'), 'سحر بیات‌زاده')
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body).toEqual({ displayName: 'سحر بیات‌زاده' })
    expect('supervisorId' in seen.writes[0].body).toBe(false)
  })

  it('clears a supervisor with an explicit null — the one field that takes one', async () => {
    // D51 makes "no supervisor" legal for a `*`-scoped account, and
    // `{"supervisorId": null}` is how a screen says so. An *absent* field means
    // "leave it alone", so a form that omitted it here would report success and
    // change nothing.
    const seen = stubServer(HOMA)
    mountDetail(9)
    await openDialog()
    await userEvent.click(await screen.findByRole('radio', { name: 'بدون سرپرست' }))
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body).toEqual({ supervisorId: null })
  })

  it('sends a chosen supervisor as their id', async () => {
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await userEvent.click(await screen.findByRole('radio', { name: /آرش تهرانی/ }))
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body).toEqual({ supervisorId: 31 })
  })
})

describe('what the edit form sends', () => {
  it('sends only what changed, and a PATCH to this account', async () => {
    // Judged against the *resulting* user on the server, so a body restating
    // every field is not wrong — but it re-validates the supervisor edge on
    // every save (the server re-checks it whenever the scopes or the supervisor
    // move), which would make correcting a display name impossible until a
    // disabled supervisor had been replaced.
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await userEvent.click(screen.getByRole('checkbox', { name: 'می‌تواند سرپرست دیگران باشد' }))
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].path).toBe('/api/users/7')
    expect(seen.writes[0].method).toBe('PATCH')
    expect(seen.writes[0].body).toEqual({ canSupervise: true })
  })

  it('sends the whole new scope list, never a delta', async () => {
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await userEvent.click(screen.getByRole('checkbox', { name: 'دپارتمان صندوق' }))
    await userEvent.click(await screen.findByRole('radio', { name: /کیوان مرادی/ }))
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body.scopes).toEqual(['dept:cooking', 'dept:cashier'])
  })

  it('normalises a changed number before sending it (D57)', async () => {
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await userEvent.clear(screen.getByLabelText('شمارهٔ موبایل'))
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '+98 ۰۹۱۲ 345 6789')
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body).toEqual({ username: '09123456789' })
  })

  it('refuses an emptied name locally rather than sending the null that earns a 400', async () => {
    // `null` on `displayName` is a 400 — "a form that lost its value" — and the
    // three fields that used to reach `.strip()` on `None` were answered 500.
    // Refused here, the administrator is told which field, before a request.
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await userEvent.clear(screen.getByLabelText('نام و نام خانوادگی'))
    await save()
    expect(await screen.findByRole('alert')).toHaveTextContent('نام کاربر را بنویسید')
    expect(seen.writes).toEqual([])
  })

  it('refuses a cleared role locally rather than sending the null that earns a 400', async () => {
    // `roleId: null` is a 400 and deliberately not the 403 an unknown *id*
    // earns: "no such role" and "not one of yours" are the same fact from where
    // the caller stands and must not be told apart, while `null` is neither of
    // them. A form that quietly dropped the field instead would report success
    // and leave the role where it was.
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await userEvent.selectOptions(screen.getByLabelText('نقش'), '')
    await save()
    expect(await screen.findByRole('alert')).toHaveTextContent('نقش کاربر را انتخاب کنید')
    expect(seen.writes).toEqual([])
  })

  it('refuses an emptied number locally, for the same reason', async () => {
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await userEvent.clear(screen.getByLabelText('شمارهٔ موبایل'))
    await save()
    expect(await screen.findByRole('alert')).toHaveTextContent('شمارهٔ موبایل معتبر نیست')
    expect(seen.writes).toEqual([])
  })

  it('sends a null on the supervisor and on nothing else beside it', async () => {
    // The one body in which a `null` legitimately appears. Every other field
    // moves in the same request, so a form that spelled "cleared" as `null`
    // generally — rather than on the one field where "no value" is a state an
    // account can be in — would be caught here rather than by a 400 in front of
    // an administrator.
    const seen = stubServer(HOMA)
    mountDetail(9)
    await openDialog()
    await userEvent.type(screen.getByLabelText('نام و نام خانوادگی'), 'ی')
    await userEvent.click(screen.getByRole('checkbox', { name: 'می‌تواند سرپرست دیگران باشد' }))
    await userEvent.click(await screen.findByRole('radio', { name: 'بدون سرپرست' }))
    const select = screen.getByLabelText('نقش')
    await userEvent.selectOptions(select, within(select).getByRole('option', { name: 'reader' }))
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body).toEqual({
      displayName: 'هما نیک‌روشی', roleId: 4, canSupervise: false, supervisorId: null,
    })
  })

  it('puts a null on no field at all when every one of them is edited', async () => {
    // The other half, and the one that reaches `scopes` and `username`: six
    // fields move at once and five of them answer 400 to an explicit null.
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await userEvent.type(screen.getByLabelText('نام و نام خانوادگی'), 'ی')
    await userEvent.clear(screen.getByLabelText('شمارهٔ موبایل'))
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.click(screen.getByRole('checkbox', { name: 'می‌تواند سرپرست دیگران باشد' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'دپارتمان صندوق' }))
    const select = screen.getByLabelText('نقش')
    await userEvent.selectOptions(select, within(select).getByRole('option', { name: 'admin' }))
    await userEvent.click(await screen.findByRole('radio', { name: /کیوان مرادی/ }))
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    const body = seen.writes[0].body
    for (const field of NEVER_NULL) {
      expect(field in body, `«${field}» was not sent at all, so this proves nothing about it`)
        .toBe(true)
      expect(body[field], `«${field}» was sent as null, which the server answers 400`)
        .not.toBeNull()
    }
    expect(body.supervisorId).toBe(33)
  })

  it('writes nothing at all when nothing was changed', async () => {
    // The server records `user.modified` only when something moved, and a
    // no-op PATCH that restates every field would still re-validate the
    // supervisor edge. Nothing to send is nothing to send.
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await save()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(seen.writes).toEqual([])
  })
})

describe('what the edit form shows afterwards', () => {
  it('shows what the server stored, without a reload', async () => {
    stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await userEvent.clear(screen.getByLabelText('نام و نام خانوادگی'))
    await userEvent.type(screen.getByLabelText('نام و نام خانوادگی'), 'سحر بیات‌زاده')
    await save()
    expect(await screen.findByRole('heading', { name: 'سحر بیات‌زاده' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'سحر بیات' })).toBeNull()
  })

  it('repeats the server\'s own sentence when the change is refused, and stays open', async () => {
    // The supervisor keys are 400s that say the submitted *value* is wrong, and
    // each names what to do next. «انجام نشد» in their place leaves an
    // administrator pressing the same button, and closing the dialog would
    // throw away everything they typed.
    stubServer(SAHAR, {
      writeStatus: 400, writeDetail: 'این انتخاب زنجیرهٔ سرپرستی را حلقه می‌کند',
    })
    mountDetail(7)
    await openDialog()
    await userEvent.click(await screen.findByRole('radio', { name: /آرش تهرانی/ }))
    await save()
    expect(await screen.findByRole('alert'))
      .toHaveTextContent('این انتخاب زنجیرهٔ سرپرستی را حلقه می‌کند')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not put a framework\'s English on a Persian screen when a 4xx carries no sentence', async () => {
    stubServer(SAHAR, {
      writeStatus: 422,
      writeDetail: [{ type: 'int_parsing', loc: ['body', 'roleId'], msg: 'Input should be a valid integer' }],
      statusText: 'Unprocessable Entity',
    })
    mountDetail(7)
    await openDialog()
    await userEvent.click(await screen.findByRole('radio', { name: /آرش تهرانی/ }))
    await save()
    expect(await screen.findByRole('alert')).toHaveTextContent('انجام نشد؛ دوباره تلاش کنید.')
    expect(screen.queryByText(/Unprocessable Entity/)).toBeNull()
  })

  it('opens on the account as it stands, not on an empty form', async () => {
    // A dialog that opens blank and PATCHes what is in it renames the account
    // to nothing the first time somebody opens it to change one checkbox.
    stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    expect(screen.getByLabelText('نام و نام خانوادگی')).toHaveValue('سحر بیات')
    expect(screen.getByLabelText('شمارهٔ موبایل')).toHaveValue('09121111111')
    expect(screen.getByRole('checkbox', { name: 'دپارتمان پخت' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'دپارتمان صندوق' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'می‌تواند سرپرست دیگران باشد' })).not.toBeChecked()
    // The select's value is the role **id**, which is what the PATCH carries.
    expect(screen.getByLabelText('نقش')).toHaveValue('4')
  })

  it('gives every control its own horizontal padding and type size', async () => {
    stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    const labelled = screen.getAllByRole('button').filter((b) => (b.textContent ?? '').trim() !== '')
    expect(labelled.length).toBeGreaterThan(1)
    for (const b of labelled) {
      expect(b.className, `«${b.textContent}» has no horizontal padding`).toMatch(/(^|\s)px-/)
      expect(b.className, `«${b.textContent}» sets no type size`).toMatch(/(^|\s)text-(caption|body|subtitle)\b/)
    }
  })
})
