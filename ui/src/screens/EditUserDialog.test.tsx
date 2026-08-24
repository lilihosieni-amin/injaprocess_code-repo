import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CANDIDATES_UNREADABLE, DEPARTMENTS_UNREADABLE, ROLES_UNREADABLE } from '../lib/userDraft'
import { EVERY_DEPARTMENT } from '../lib/scopes'
import { ALL_REPORTS, UNDRAWABLE_SCOPES } from './ScopePicker'
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

/** The real deployment's nine, which is the registry the height claim is about:
 *  three departments could never have produced 2207px. */
const NINE = [
  ...DEPARTMENTS,
  { code: 'management', name: 'مدیریت', count: 0, subs: 0 },
  { code: 'accounting', name: 'حسابداری', count: 0, subs: 0 },
  { code: 'warehouse', name: 'انبار', count: 0, subs: 0 },
  { code: 'procurement', name: 'تدارکات', count: 0, subs: 0 },
  { code: 'preparation', name: 'آماده‌سازی', count: 0, subs: 0 },
  { code: 'logistics', name: 'پشتیبانی', count: 0, subs: 0 },
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
  role: 'reader',
  id: 33, username: '09123333333', displayName: 'کیوان مرادی',
  scopes: ['*'], canSupervise: false,
}
const ARASH: SupervisorCandidate = {
  role: 'reader',
  id: 31, username: '09121212121', displayName: 'آرش تهرانی',
  scopes: ['dept:cooking'], canSupervise: true,
}

/**
 * Sahar again, but under an **active, eligible** supervisor: Arash covers
 * `dept:cooking` and is on her candidate list. Distinct from `SAHAR` on purpose
 * — with a disabled supervisor, "the edge is refused" and "the edge was never
 * eligible to begin with" are the same picture, and the test below is about the
 * scopes moving out from under an edge that was fine.
 */
const SAHAR_UNDER_ARASH: AdminUser = {
  ...SAHAR,
  supervisor: { id: 31, username: '09121212121', displayName: 'آرش تهرانی', disabled: false },
}

/**
 * **D11's «Report reader»** — a Reader holding one report of one department,
 * which is the third shape of the scope grammar (`dept:{code}/report:{kind}`)
 * and a real person in the deployment table.
 *
 * Her supervisor is Keyvan, who holds `*` and so covers anything she could be
 * given: nothing below is about eligibility, so the edge is never what fails.
 */
const RAHA: AdminUser = {
  id: 11, username: '09126666666', displayName: 'رها فرجی',
  roleId: 4, role: 'reader', capabilities: ['view', 'comment', 'export_pdf'],
  scopes: ['dept:dining/report:steps'],
  supervisor: { id: 33, username: '09123333333', displayName: 'کیوان مرادی', disabled: false },
  canSupervise: false, disabled: false, createdAt: 1700000000,
}

/**
 * The same account with **no scope row at all** — and it is the whole reason the
 * fixture above proves anything.
 *
 * The defect was that a report-scoped account rendered with every box blank,
 * i.e. *identically to this one*. An assertion that only said «the department
 * box is not ticked» is therefore true of both, and passes on the broken form;
 * only a pair that separates them can fail on it.
 */
const RAHA_UNSCOPED: AdminUser = { ...RAHA, scopes: [] }

/** A report kind this build has no wording for — the server may know one before
 *  the UI does, and `exports.EXPORT_KINDS` is where the two meet. The form draws
 *  no box for it, must not silently drop it, and must say it is there.
 *
 *  **Note what this fixture is not.** Its scope is *well formed*:
 *  `parseScope` returns `{shape: 'report', code: 'dining', report: 'daily'}` and
 *  it is `reportLabel` that has no wording. It therefore says nothing whatever
 *  about the branch that handles a scope the grammar **refuses** — which is a
 *  different clause in `UserFields` and a different branch in `scopeLabel`.
 *  `RAHA_REFUSED` below is the fixture for that one. */
const RAHA_UNKNOWN_KIND: AdminUser = { ...RAHA, scopes: ['dept:dining/report:daily'] }

/**
 * **There is deliberately no fixture here holding a scope the grammar refuses.**
 * It would not reach this dialog: `mayManage`'s scope clause runs every one of
 * the target's scopes through `scopeContains`, which answers `false` for a
 * malformed argument even to a `*` holder — so such an account is covered by
 * nobody, `UserDetail` draws no «ویرایش» button on it, and the server
 * answers the same `SCOPE_NOT_COVERED`. A fixture written for it here fails on
 * the *button*, before the fieldset it claims to be about is ever on screen.
 *
 * The fieldset's own promise about that row is pinned where the input can
 * actually be supplied — `UserFields.test.tsx`, which renders the component
 * directly — and the rendering half, which **is** reachable in the running app,
 * is pinned in `SupervisorPicker.test.tsx`: `eligible_supervisors` reads
 * containment, an account holding no scope row at all is vacuously covered by
 * everybody, and so a candidate whose own stored scope the grammar refuses is
 * really offered for one.
 */

/**
 * Two grants of two different shapes — a whole department and one report of
 * another. **The account the departments read failing is worst for**: with
 * `/api/departments` answered 500 the fieldset had one block per department and
 * therefore none, so both of these were drawn as nothing at all.
 *
 * Two shapes rather than two departments, so that the pair separates a form
 * which lost the department blocks from one which merely mislaid a checkbox.
 */
const RAHA_TWO_GRANTS: AdminUser = {
  ...RAHA, scopes: ['dept:cooking', 'dept:dining/report:steps'],
}

interface Seen {
  gets: string[]
  writes: { path: string; method: string; body: Record<string, unknown> }[]
  /**
   * Replace what `/api/users/supervisor-candidates` answers **on the same
   * stub**. Calling `stubServer` a second time would install a second `fetch`
   * recording into a second `Seen`, and an `expect(seen.writes).toEqual([])`
   * that followed would then be true of an object nothing had written to — a
   * test whose input is not the shape its name claims.
   */
  setCandidates: (next: SupervisorCandidate[]) => void
  /**
   * Stop failing whichever read `rolesStatus` / `candidatesStatus` was failing.
   *
   * The failure screen offers a retry, and a test that only asserted the button
   * exists would not show it is wired to anything — so the outage ends and the
   * form has to come back on the *second* answer.
   */
  healReads: () => void
}

/**
 * A server that holds the row, so a write is visible to the read that follows
 * it. A screen that never invalidates keeps drawing the pre-write state and is
 * caught here — which is the whole reason the row is stored rather than a fixed
 * body being answered twice.
 */
function stubServer(user: AdminUser, opts: {
  candidates?: SupervisorCandidate[]
  /** The registry `/api/departments` answers. Three by default; `NINE` is the
   *  real deployment, and the scope grid's height is a claim about nine. */
  departments?: typeof DEPARTMENTS
  /** Answer the candidate list never — the query stays `isPending` and its data
   *  stays `undefined`, which is the state a slow or hung request really leaves
   *  the form in. */
  stallCandidates?: boolean
  /**
   * Answer `GET /api/roles` with this status instead of 200.
   *
   * **A failed read and an empty one are different facts**, and until this
   * option existed no test in any of the three dialog suites set a non-200 on a
   * read at all: making either of them fail outright left 785/785 green, because
   * `data ?? []` renders a failure as a genuinely empty list — a role `<select>`
   * with nothing in it, and a picker announcing that nobody in the installation
   * may supervise this account.
   */
  rolesStatus?: number
  /** The same, for `GET /api/users/supervisor-candidates`. Separate from
   *  `rolesStatus` because the two produce different false claims and each has
   *  to be reachable on its own. */
  candidatesStatus?: number
  /**
   * The same, for `GET /api/departments` — **the same defect one read further
   * out**, and the one no option in this file could reach until now.
   *
   * The scope fieldset draws one block per department out of this registry, so
   * a failure left it with `*` and nothing else: an account holding
   * `dept:cooking` and `dept:dining/report:steps` opened with both grants drawn
   * as no grant at all, and no notice that anything was missing.
   */
  departmentsStatus?: number
  writeStatus?: number
  writeDetail?: unknown
  statusText?: string
} = {}): Seen {
  let row = { ...user }
  let candidates = opts.candidates ?? [KEYVAN, ARASH]
  let rolesStatus = opts.rolesStatus ?? 200
  let candidatesStatus = opts.candidatesStatus ?? 200
  let departmentsStatus = opts.departmentsStatus ?? 200
  const seen: Seen = {
    gets: [], writes: [],
    setCandidates: (next) => { candidates = next },
    healReads: () => { rolesStatus = 200; candidatesStatus = 200; departmentsStatus = 200 },
  }
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
    if (path === '/api/roles') {
      return rolesStatus === 200 ? json(ROLES) : json({ detail: 'نه' }, rolesStatus)
    }
    if (path === '/api/departments') {
      return departmentsStatus === 200
        ? json(opts.departments ?? DEPARTMENTS)
        : json({ detail: 'نه' }, departmentsStatus)
    }
    if (path.startsWith('/api/users/supervisor-candidates')) {
      if (opts.stallCandidates) return new Promise<Response>(() => {})
      if (candidatesStatus !== 200) return json({ detail: 'نه' }, candidatesStatus)
      return json(candidates)
    }
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

/** Open the dialog and wait for the department registry to land — the scope grid
 *  is the last thing the form draws out of a read. The role list and the
 *  candidate list live behind popovers, so each test waits for the one it opens. */
async function openDialog() {
  await userEvent.click(await screen.findByRole('button', { name: 'ویرایش' }))
  await screen.findByRole('dialog')
  await screen.findByRole('checkbox', { name: 'سالن' })
}

/** The dialog's own controls, never the record screen's behind it. */
const dialog = () => within(screen.getByRole('dialog'))
const roleTrigger = () => dialog().getByRole('button', { name: /^نقش/ })
const supervisorTrigger = () => dialog().getByRole('button', { name: /^سرپرست/ })

async function openSupervisors(): Promise<HTMLElement> {
  await userEvent.click(supervisorTrigger())
  return screen.findByRole('listbox')
}

async function chooseSupervisor(name: RegExp | string) {
  const list = await openSupervisors()
  await userEvent.click(await within(list).findByRole('option', { name }))
}

async function chooseRole(name: string) {
  await userEvent.click(roleTrigger())
  await userEvent.click(await screen.findByRole('option', { name }))
}

/** Open one department tile's «نماها» popover. */
async function openViews(department: string) {
  await userEvent.click(dialog().getByRole('button', { name: `نماهای ${department}` }))
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
    expect(await screen.findByRole('button', { name: 'ویرایش' })).toBeInTheDocument()
  })

  it('withholds it from an Admin looking at an account that confers more than they hold', async () => {
    // The subset rule (D13). Every write from here comes back NOT_A_SUBSET, so
    // a dialog drawn for this administrator is a form they cannot submit.
    session = ADMIN
    stubServer({ ...SAHAR, capabilities: EDITOR.capabilities })
    mountDetail(7)
    expect(await screen.findByRole('heading', { name: 'سحر بیات' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ویرایش' })).toBeNull()
  })

  it('asks the server for nothing until the dialog is opened', async () => {
    // The roles and the candidate list are what this is about: they are two
    // requests per visit to anybody's record if the dialog is mounted eagerly,
    // and a second opening would start on the account as it stood before the
    // first. The record itself and the department registry are read because
    // §6.8 DRAWS both — the record is the screen, and panel 1 needs the
    // registry to print «سالن» where the row stores `dept:dining` — so they are
    // named here rather than swept into a bare `toEqual([])` that would have to
    // be loosened the next time the screen legitimately reads something.
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await screen.findByRole('button', { name: 'ویرایش' })
    await waitFor(() => expect([...seen.gets].sort())
      .toEqual(['/api/departments', '/api/users/7']))
    expect(seen.gets.filter((p) => p.startsWith('/api/roles')
      || p.startsWith('/api/users/supervisor-candidates'))).toEqual([])
  })
})

describe('the supervisor picker on the edit form', () => {
  it('names this very user as an exclusion, so nobody is offered themselves', async () => {
    // `eligible_supervisors` takes `excluding` as a required keyword precisely
    // because making it optional let a caller silently offer somebody
    // themselves — which `supervisor_error` then refuses as the one entry the
    // form made look reasonable.
    //
    // Asserted on the **query**, and deliberately not on the rendered list. The
    // stub ignores `exclude` and Sahar is not among its candidates, so this
    // cannot show that she would otherwise appear — and it does not need to:
    // the picker filters nobody (that is its whole contract, and
    // `SupervisorPicker.test.tsx` pins it), so sending the parameter *is* the
    // client's entire obligation. A stub that honoured `exclude` would only
    // test the stub. Please do not "fix" this into one.
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
    await userEvent.click(screen.getByRole('checkbox', { name: 'صندوق' }))
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
    // …and this is the one save the picker's note is true of, so it is drawn:
    // neither the edge nor the scopes are in this request, so the server is not
    // asked about the edge at all and Maryam stays exactly where she is.
    expect(screen.getByText(/سرپرست کنونی در این فهرست نیست/)).toBeInTheDocument()
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
    await chooseSupervisor('بدون سرپرست')
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body).toEqual({ supervisorId: null })
  })

  it('will not send a chosen supervisor the server has stopped offering', async () => {
    // **The edit form's own local pre-check, which nothing else here reaches.**
    // Every other test in this file either leaves the edge alone (D14) or picks
    // somebody who is on the list, so the clause that asks whether a *moved*
    // supervisor is eligible could be deleted outright and every one of them
    // would still pass.
    //
    // Arash is eligible when the picker is first read, and is chosen. He is then
    // disabled — or loses `can_supervise` — elsewhere in the installation, and
    // the next read of the list for these same scopes comes back without him.
    // Sent anyway, the id earns a 400 naming somebody no longer on screen.
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await chooseSupervisor(/آرش تهرانی/)
    seen.setCandidates([KEYVAN])
    // Ticked and unticked: the scopes end where they started — so the patch
    // carries the supervisor and nothing else — while the picker has re-read
    // the list in between.
    await userEvent.click(screen.getByRole('checkbox', { name: 'صندوق' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'صندوق' }))
    await waitFor(() => expect(supervisorTrigger()).toHaveAccessibleName(/انتخاب کنید/))
    await save()
    expect(await screen.findByRole('alert'))
      .toHaveTextContent('این شخص نمی‌تواند سرپرست این کاربر باشد')
    expect(seen.writes).toEqual([])
  })

  it('re-judges the edge when the scopes move, exactly as the server does', async () => {
    // The server re-validates on *supervisor moved **or** scopes moved*, because
    // an eligibility that held for `dept:cooking` says nothing about
    // `dept:cooking` plus `dept:cashier`. Sahar's supervisor here is active and
    // eligible and is not touched at all: only the scopes widen, and Arash stops
    // covering everything she will hold. A form that asked about the supervisor
    // alone would send `{scopes: […]}` and be answered 400 `NOT_ELIGIBLE` — the
    // round trip this check exists to save, spent anyway.
    const seen = stubServer(SAHAR_UNDER_ARASH)
    mountDetail(7)
    await openDialog()
    await waitFor(() => expect(supervisorTrigger()).toHaveAccessibleName(/آرش تهرانی/))
    seen.setCandidates([KEYVAN])
    await userEvent.click(screen.getByRole('checkbox', { name: 'صندوق' }))
    await waitFor(() => expect(supervisorTrigger()).toHaveAccessibleName(/انتخاب کنید/))
    // The other half of the D14 note above: Arash is off the list here too, and
    // here «تا وقتی تغییرش ندهید همان‌جا می‌ماند» would be false — this save
    // moves the scopes, so the edge is re-judged and refused rather than left
    // alone. The note must not be drawn over a promise this form cannot keep.
    expect(screen.queryByText(/سرپرست کنونی در این فهرست نیست/)).toBeNull()
    await save()
    expect(await screen.findByRole('alert'))
      .toHaveTextContent('این شخص نمی‌تواند سرپرست این کاربر باشد')
    expect(seen.writes).toEqual([])
  })

  it('refuses nobody while the list it would check against is still in flight', async () => {
    // **The local check is a convenience (D48) and must never be a stricter gate
    // than the server.** Homa's supervisor is Keyvan, who holds `*` and so
    // covers anything she could be given — the server would accept this save
    // without hesitating. With the candidate request still outstanding the list
    // is not `[]`, it is *unknown*, and a check that read those two as the same
    // thing would answer «این شخص نمی‌تواند سرپرست این کاربر باشد» and send
    // nothing at all, leaving an administrator with a form that cannot be saved
    // and no way to find out why.
    const seen = stubServer(HOMA, { stallCandidates: true })
    mountDetail(9)
    await openDialog()
    // Homa is `*`-scoped, and the department grid is DISABLED under «کل سامانه»
    // — dimmed and inert, not dimmed and secretly operable — so narrowing her to
    // one department is the two steps a hand actually takes. It used to be one
    // click, which only the keyboard could make.
    await userEvent.click(screen.getByRole('checkbox', { name: 'کل سامانه' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'پخت' }))
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body).toEqual({ scopes: ['dept:cooking'] })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sends a chosen supervisor as their id', async () => {
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await chooseSupervisor(/آرش تهرانی/)
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body).toEqual({ supervisorId: 31 })
  })
})

/** The two report kinds. They no longer carry a department in their name: one
 *  «نماها» popover is open at a time, so the two controls on screen belong to
 *  exactly one department and nine identically-named boxes never coexist. */
const STEPS = 'راهنمای گام‌به‌گام'
const FLOW = 'مستندات کامل'

describe('how much of the box the form is', () => {
  it('draws a bounded number of controls on a nine-department registry', async () => {
    // Was 1 + 9 + 18 = 28 checkboxes plus a native select and N radios — 2207px
    // of scrollHeight in an 850px box. Now: nine tiles + «کل سامانه» +
    // «سرپرست‌شدن», with the report level behind a per-tile popover. jsdom
    // measures nothing, so this is the structural half; the pixels are in
    // `ui/e2e/user-dialog.spec.ts`.
    stubServer(SAHAR, { departments: NINE })
    mountDetail(7)
    await openDialog()
    const box = screen.getByRole('dialog')
    await waitFor(() =>
      expect(within(box).getAllByRole('checkbox')).toHaveLength(11))
    expect(within(box).queryAllByRole('combobox')).toHaveLength(0)   // no native select
    expect(box.querySelectorAll('select')).toHaveLength(0)
    // …and no radio anywhere: forty candidates were forty 49px rows (F29).
    expect(within(box).queryAllByRole('radio')).toHaveLength(0)
  })
})

describe('the scope fieldset', () => {
  it('draws a report-scoped account\'s own grant', async () => {
    // The form offered `*` and one box per department and nothing else, so
    // `dept:dining/report:steps` matched no box: a «Report reader» opened with
    // every box blank — reading as "no departments at all" — while the record
    // directly above the button showed her chip correctly. The two contradicted
    // each other on one page.
    stubServer(RAHA)
    mountDetail(11)
    await openDialog()
    // Legible before anything is opened: the tile names its own narrowing.
    expect(dialog().getByText(/فقط راهنمای گام‌به‌گام/)).toBeInTheDocument()
    await openViews('سالن')
    expect(screen.getByRole('checkbox', { name: STEPS })).toBeChecked()
    // …and not as the whole department, which is what the obvious "repair" of a
    // blank fieldset would have made her. The tile's own tick says she reaches
    // «سالن» — owner ruling, *"the checkbox near of department name is always
    // on"* — and «همهٔ گزارش‌ها» inside the popover is where whole-or-narrowed
    // is now answered.
    expect(screen.getByRole('checkbox', { name: 'سالن' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: ALL_REPORTS })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: FLOW })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'کل سامانه' })).not.toBeChecked()
    expect(screen.queryByText(new RegExp(UNDRAWABLE_SCOPES))).toBeNull()
  })

  it('draws an account holding nothing as holding nothing, which is what makes that mean something', async () => {
    // The separating fixture. Without it, "the department box is not ticked" is
    // true of the broken form too, and the assertion above passes on the defect
    // it was written for.
    stubServer(RAHA_UNSCOPED)
    mountDetail(11)
    await openDialog()
    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked()
    // …and no tile claims a narrowing either, which is the half a tick alone
    // cannot separate: a report-scoped account draws its tile unticked too.
    expect(dialog().queryByText(/^فقط /)).toBeNull()
    await openViews('سالن')
    expect(screen.getByRole('checkbox', { name: STEPS })).not.toBeChecked()
  })

  it('asks for candidates covering the report scope itself, not the department around it', async () => {
    // `eligible_supervisors` takes the scopes verbatim, and `dept:dining` is a
    // *wider* question than `dept:dining/report:steps`: asked about the
    // department, the server returns fewer people than may really supervise her.
    const seen = stubServer(RAHA)
    mountDetail(11)
    await openDialog()
    await waitFor(() =>
      expect(candidateQuery(seen)).toContain('scope=dept%3Adining%2Freport%3Asteps'))
  })

  it('narrows a whole department to one report, dropping the department grant', async () => {
    // The narrowing act. Holding both would store the same reach twice —
    // `dept:x` already covers `dept:x/report:k` — and would leave an
    // administrator who ticked one box believing they had taken something away.
    const seen = stubServer(SAHAR_UNDER_ARASH)
    mountDetail(7)
    await openDialog()
    expect(screen.getByRole('checkbox', { name: 'پخت' })).toBeChecked()
    await openViews('پخت')
    expect(screen.getByRole('checkbox', { name: ALL_REPORTS })).toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: STEPS }))
    // The department is still reached — the tick follows the department — and
    // it is the WIDE grant that came off, which is what the popover now states.
    expect(screen.getByRole('checkbox', { name: 'پخت' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: ALL_REPORTS })).not.toBeChecked()
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body.scopes).toEqual(['dept:cooking/report:steps'])
  })

  it('widens a report scope to the whole department only when «همهٔ گزارش‌ها» is ticked', async () => {
    // The widening act, and it is one press on a box labelled with every report
    // of the department — never a side effect of clearing a narrower one.
    // Owner ruling moved that press from the tile's tick into the popover: the
    // tick is already on for a report-scoped account, so pressing it there is a
    // subtraction.
    const seen = stubServer(RAHA)
    mountDetail(11)
    await openDialog()
    await openViews('سالن')
    await userEvent.click(screen.getByRole('checkbox', { name: ALL_REPORTS }))
    expect(screen.getByRole('checkbox', { name: STEPS })).not.toBeChecked()
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body.scopes).toEqual(['dept:dining'])
  })

  it('takes the last report away without handing back the department it belonged to', async () => {
    // **The one that pins "a subtraction never widens".** A fieldset that read
    // "no report ticked" as "the whole department" would answer this press by
    // granting more than she had, silently, on the way out.
    const seen = stubServer(RAHA)
    mountDetail(11)
    await openDialog()
    await openViews('سالن')
    await userEvent.click(screen.getByRole('checkbox', { name: STEPS }))
    expect(screen.getByRole('checkbox', { name: 'سالن' })).not.toBeChecked()
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body.scopes).toEqual([])
  })

  it('lets a narrowing be a set of reports rather than one', async () => {
    // «or more» in the grammar: a second kind joins the first. A control that
    // behaved like a radio would silently drop the report she already held.
    const seen = stubServer(RAHA)
    mountDetail(11)
    await openDialog()
    await openViews('سالن')
    await userEvent.click(screen.getByRole('checkbox', { name: FLOW }))
    expect(screen.getByRole('checkbox', { name: STEPS })).toBeChecked()
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect([...(seen.writes[0].body.scopes as string[])].sort())
      .toEqual(['dept:dining/report:flowchart', 'dept:dining/report:steps'])
  })

  it('names a scope it can draw no box for, and sends it back untouched', async () => {
    // `user_scopes.scope` is `TEXT NOT NULL` with no CHECK and the server may
    // learn a report kind before this build does, so a stored scope with no
    // control on this form is reachable. Drawn as nothing it would be the same
    // defect one level down; dropped from the request it would revoke access
    // nobody decided to revoke.
    const seen = stubServer(RAHA_UNKNOWN_KIND)
    mountDetail(11)
    await openDialog()
    // Inside the DIALOG. §6.8 panel 1 behind it names every scope through the
    // same `scopeLabel`, so an unscoped query now matches the record screen's
    // chip as well as the fieldset's line — and would go on passing if the
    // fieldset stopped drawing it at all.
    const form = screen.getByRole('dialog')
    expect(await within(form).findByText(/سالن\/report:daily/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: 'صندوق' }))
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body.scopes).toEqual(['dept:cashier', 'dept:dining/report:daily'])
  })

})

describe('when one of the dialog\'s own reads fails', () => {
  /** The dialog, opened without waiting for a role option — there is none to
   *  wait for when the read this test is about is the one that failed. */
  async function openFailedDialog() {
    await userEvent.click(await screen.findByRole('button', { name: 'ویرایش' }))
    await screen.findByRole('dialog')
  }

  it('says the supervisor list did not load, instead of announcing that nobody may supervise this account', async () => {
    // **Two contradictory false sentences at once.** `candidates.data ?? []`
    // turns a 500 into an empty list, so the picker said «کسی نمی‌تواند سرپرست
    // این کاربر باشد؛ دامنهٔ دسترسی را کم‌تر کنید…» — advice to shrink this
    // account, about an installation it had learned nothing about — and, of the
    // same account, «سرپرست کنونی در این فهرست نیست», which is said of Arash:
    // active, eligible, and simply absent from a list that never arrived.
    stubServer(SAHAR_UNDER_ARASH, { candidatesStatus: 500 })
    mountDetail(7)
    await openFailedDialog()
    expect(await screen.findByText(CANDIDATES_UNREADABLE)).toBeInTheDocument()
    expect(screen.queryByText(/برای این نقش سرپرستی در دسترس نیست/)).toBeNull()
    expect(screen.queryByText(/سرپرست کنونی در این فهرست نیست/)).toBeNull()
    // …and no picker at all, so neither sentence has anywhere to come from.
    expect(dialog().queryByRole('button', { name: /^سرپرست/ })).toBeNull()
  })

  it('says the role list did not load, instead of a select nothing can be chosen from', async () => {
    // The other read, and a different false claim: `/api/roles` failing left
    // «انتخاب کنید» alone in the select and refused every submit with «نقش
    // کاربر را انتخاب کنید» — about the one field nothing could be put into.
    stubServer(SAHAR, { rolesStatus: 500 })
    mountDetail(7)
    await openFailedDialog()
    expect(await screen.findByText(ROLES_UNREADABLE)).toBeInTheDocument()
    expect(dialog().queryByRole('button', { name: /^نقش/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'ثبت تغییرات' })).toBeNull()
  })

  it('offers a retry, and draws the form once the read succeeds', async () => {
    // A 5xx is the transient kind, so `retryQuery` says the button is worth
    // drawing. Asserting the button alone would not show it is wired to
    // anything — the outage ends, and the picker the failure replaced arrives.
    const seen = stubServer(SAHAR_UNDER_ARASH, { candidatesStatus: 500 })
    mountDetail(7)
    await openFailedDialog()
    await screen.findByText(CANDIDATES_UNREADABLE)
    seen.healReads()
    await userEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    await waitFor(() => expect(supervisorTrigger()).toHaveAccessibleName(/آرش تهرانی/))
  })

  it('says the department registry did not load, instead of drawing two grants as none', async () => {
    // **The third read, and the same defect one further out.** `/api/departments`
    // is what the scope fieldset draws its blocks from, and the old code took
    // `data` alone and gated the undrawable notice on `data === undefined` — so
    // a 500 and a request still in flight were one state. Rendered, the form was
    // «همهٔ دپارتمان‌ها», «می‌تواند سرپرست دیگران باشد», and nothing else:
    // Raha's `dept:cooking` and `dept:dining/report:steps` both drawn as no
    // grant at all, with no word about the read, to the one person who acts on
    // it. It could write nothing wrong — `draftPatch` omits scopes nobody
    // touched — which is exactly why nothing caught it.
    stubServer(RAHA_TWO_GRANTS, { departmentsStatus: 500 })
    mountDetail(11)
    await openFailedDialog()
    expect(await screen.findByText(DEPARTMENTS_UNREADABLE)).toBeInTheDocument()
    // Not the grid with its one surviving box: «کل سامانه» unticked, beside no
    // departments whatever, is a picture of an account that reaches nothing, and
    // this dialog has learned nothing about what she reaches. The `*` control is
    // «کل سامانه» on screen and `EVERY_DEPARTMENT` to a screen reader; neither
    // is drawn over a registry that did not arrive.
    expect(screen.queryByRole('checkbox', { name: 'کل سامانه' })).toBeNull()
    expect(screen.queryByText(EVERY_DEPARTMENT)).toBeNull()
    expect(screen.queryByRole('button', { name: 'ثبت تغییرات' })).toBeNull()
  })

  it('retries the department registry too, and draws both grants once it arrives', async () => {
    // The retry has to refetch **the read that failed**: a query sitting in
    // `error` refetches on nothing but being asked, so a handler that renewed
    // only the two that were already fine would answer the press with the very
    // same screen. And the grants are asserted, not merely the form: a fieldset
    // that came back empty would be the original defect wearing a retry button.
    const seen = stubServer(RAHA_TWO_GRANTS, { departmentsStatus: 500 })
    mountDetail(11)
    await openFailedDialog()
    await screen.findByText(DEPARTMENTS_UNREADABLE)
    seen.healReads()
    await userEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByRole('checkbox', { name: 'پخت' })).toBeChecked()
    await openViews('سالن')
    expect(screen.getByRole('checkbox', { name: STEPS })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'کل سامانه' })).not.toBeChecked()
  })
})

describe('what the edit form sends', () => {
  it('sends only what changed, and a PATCH to this account', async () => {
    // Judged against the *resulting* user on the server, so a body restating
    // every field is not wrong on its face — and it would **not** re-validate
    // the supervisor either, since the server compares values
    // (`supervisor_id != target["supervisor_id"] or scopes != before_scopes`)
    // and a restated unchanged list compares equal. What it would do is put
    // `scopes` in the request, and a present `scopes` field is run through
    // `_clean_scopes`, which 400s on any entry the grammar refuses — so an
    // account holding such a row could not have its display name corrected at
    // all. The diff never sends what nobody edited.
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await userEvent.click(screen.getByRole('checkbox', { name: 'سرپرست‌شدن' }))
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
    await userEvent.click(screen.getByRole('checkbox', { name: 'صندوق' }))
    await chooseSupervisor(/کیوان مرادی/)
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    // Sorted, because `ScopePicker` sorts: the server stores `sorted(set(raw))`
    // and `draftPatch` compares order-insensitively, so the tick order is not a
    // fact about the account and must not reach the wire as one.
    expect(seen.writes[0].body.scopes).toEqual(['dept:cashier', 'dept:cooking'])
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

  it('offers no way to clear the role, because `roleId: null` is a refusal (R5)', async () => {
    // `roleId: null` is a 400 the server calls "a form that lost its value" —
    // deliberately not the 403 an unknown *id* earns, since "no such role" and
    // "not one of yours" are the same fact from where the caller stands and must
    // not be told apart. The old native `<select>` carried an «انتخاب کنید»
    // option that produced exactly that body, and the form then refused it
    // locally: a control drawn only to be turned down. §6.14's Dropdown has no
    // such row, so the state is unreachable rather than merely refused.
    //
    // The local refusal itself is still pinned where the state IS reachable —
    // the create form, which opens with nothing chosen.
    stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    await userEvent.click(roleTrigger())
    const list = await screen.findByRole('listbox')
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(3))
    expect(within(list).queryByRole('option', { name: 'انتخاب کنید' })).toBeNull()
    for (const option of within(list).getAllByRole('option')) {
      expect(option.textContent).not.toBe('')
    }
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
    // **The role moves first, and it has to.** Homa is an Admin, and under the
    // owner's ruling an Admin is not asked whether they may supervise — the box
    // is not on the form at all until she is a Reader. Reaching for it before
    // the role changed is reaching for a control that is not there.
    await chooseRole('خواننده')
    await userEvent.click(screen.getByRole('checkbox', { name: 'سرپرست‌شدن' }))
    await chooseSupervisor('بدون سرپرست')
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body).toEqual({
      displayName: 'هما نیک‌روشی', roleId: 4, canSupervise: false, supervisorId: null,
    })
  })

  /**
   * **Owner ruling — «the editor and admin allways can be supervisor. so it
   * shouln't show سرپرست شدن check box for this users.»**
   *
   * Two halves, and the second is the one that matters: withdrawing the control
   * while leaving the stored flag alone would make the ruling a lie in the only
   * place it is read. `delegation.py:468` gates candidacy on
   * `can_supervise OR '*' in scopes`, so an Editor stored with the flag off is
   * refused as somebody's supervisor by the server — and with the checkbox gone
   * there would be no way left to mend it.
   */
  it('never asks an admin whether they may supervise, and stores that they may', async () => {
    // «مدیر» rather than «ادیتور» because the actor in this file is an Admin and
    // `/api/roles` returns only the roles they may confer — `editor` is not one
    // of them (see `ROLES`). The rule is one list of two identifiers, so either
    // arm exercises it; `NewUserDialog.test.tsx` is where the Editor arm sits.
    const seen = stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    // Sahar is a Reader with the flag off, so the box is on the form…
    expect(screen.getByRole('checkbox', { name: 'سرپرست‌شدن' })).not.toBeChecked()
    await chooseRole('مدیر')
    // …and it is gone the moment she is an Admin.
    expect(screen.queryByRole('checkbox', { name: 'سرپرست‌شدن' })).toBeNull()
    await save()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body.canSupervise).toBe(true)
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
    await userEvent.click(screen.getByRole('checkbox', { name: 'سرپرست‌شدن' }))
    await userEvent.click(screen.getByRole('checkbox', { name: 'صندوق' }))
    await chooseRole('مدیر')
    await chooseSupervisor(/کیوان مرادی/)
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
    // no-op PATCH restating every field would still hand `scopes` to
    // `_clean_scopes`. Nothing to send is nothing to send.
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
    await chooseSupervisor(/آرش تهرانی/)
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
    await chooseSupervisor(/آرش تهرانی/)
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
    expect(screen.getByRole('checkbox', { name: 'پخت' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'صندوق' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'سرپرست‌شدن' })).not.toBeChecked()
    // The trigger reads the role's Persian wording; the VALUE behind it is the
    // id, which is what the PATCH carries and what the saves above prove.
    expect(roleTrigger()).toHaveAccessibleName(/خواننده/)
  })

  it('gives every control its own horizontal padding and type size', async () => {
    stubServer(SAHAR)
    mountDetail(7)
    await openDialog()
    const labelled = screen.getAllByRole('button').filter((b) => (b.textContent ?? '').trim() !== '')
    expect(labelled.length).toBeGreaterThan(1)
    for (const b of labelled) {
      expect(b.className, `«${b.textContent}» has no horizontal padding`).toMatch(/(^|\s)px-/)
      // `text-fs-*` joins the three role steps: §6.8's record screen behind this
      // dialog sets its buttons from the literal scale (`text-fs-sm`,
      // `text-fs-sm2`), and this sweep reads every labelled button on the page
      // deliberately. What is being asserted is that a size is set at all —
      // `Button`'s BASE sets none (I5) — not which of the two scales names it.
      expect(b.className, `«${b.textContent}» sets no type size`)
        .toMatch(/(^|\s)text-(caption|body|subtitle|fs-[a-z0-9]+)\b/)
    }
  })
})
