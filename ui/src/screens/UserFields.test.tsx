import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EVERY_DEPARTMENT } from '../lib/scopes'
import { UNDRAWABLE_SCOPES } from './ScopePicker'
import { UserFields } from './UserFields'
import type { UserDraft } from '../lib/userDraft'
import type { Role } from '../api/users'

afterEach(() => {
  vi.restoreAllMocks()
  // `restoreAllMocks` does not undo `stubGlobal`, and `vite.config.ts` sets no
  // `unstubGlobals`, so a `fetch` installed by one block would otherwise stay
  // installed for every block after it.
  vi.unstubAllGlobals()
})

const JSON_HEAD = { 'Content-Type': 'application/json' }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEAD })

const ROLES: Role[] = [
  { id: 4, name: 'reader', capabilities: ['view', 'comment', 'export_pdf'] },
]

const DEPARTMENTS = [
  { code: 'cooking', name: 'پخت', count: 0, subs: 0 },
  { code: 'dining', name: 'سالن', count: 0, subs: 0 },
]

/**
 * Two grants of two different shapes — a whole department and one report of
 * another. Every one of them is drawn out of `/api/departments`, so with that
 * read gone this account has two rows and no control on the form.
 */
const TWO_GRANTS = ['dept:cooking', 'dept:dining/report:steps']

/**
 * **`/api/departments`, answered by nobody.** The query stays `pending` with
 * `data` undefined, which is a different fact from the 500 below and has the
 * opposite right answer — and the two are indistinguishable to `data ?? []`.
 */
function stubDepartmentsInFlight() {
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    if (path === '/api/departments') return new Promise<Response>(() => {})
    throw new Error(`unexpected request: ${path}`)
  }))
}

function stubDepartmentsFailed() {
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    if (path === '/api/departments') return json({ detail: 'نه' }, 500)
    throw new Error(`unexpected request: ${path}`)
  }))
}

function stubDepartments() {
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    if (path === '/api/departments') return json(DEPARTMENTS)
    throw new Error(`unexpected request: ${path}`)
  }))
}

/**
 * The fieldset on its own, with the two lists it takes as props already in hand
 * — so `/api/departments` is the component's only request and the only thing
 * these tests vary.
 *
 * Rendered directly rather than through a dialog on purpose: both dialogs now
 * stand a `LoadFailedScreen` in front of this component when that read fails, so
 * through either of them the gate below is unreachable and a mutant of it cannot
 * be made to die. What is pinned here is the component's own promise — a scope
 * it can draw no control for is never *also* invisible — which is what a third
 * caller would arrive expecting.
 */
function Harness({ scopes }: { scopes: string[] }) {
  const [draft, setDraft] = useState<UserDraft>({
    displayName: 'رها فرجی', username: '09126666666', roleId: 4,
    scopes, canSupervise: false, supervisorId: null,
  })
  return (
    <UserFields draft={draft} onChange={setDraft} roles={ROLES} candidates={[]}
      candidatesPending={false} supervisorStaysPut={false} />
  )
}

function mount(scopes: string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><Harness scopes={scopes} /></QueryClientProvider>,
  )
}

describe('the scope fieldset when the department registry is not there', () => {
  it('says nothing while the registry is still on its way', async () => {
    // Half one of the pair, and the reason the gate exists at all: in flight,
    // **every** department scope is one this form has no box for, so a notice
    // drawn unconditionally would flash «این دامنه‌ها را این فرم نمی‌تواند نشان
    // دهد» across a perfectly ordinary account on every open.
    stubDepartmentsInFlight()
    mount(TWO_GRANTS)
    // The fieldset really is on screen — `*` is drawn from no registry — so the
    // absence below is a decision and not an unmounted component.
    expect(await screen.findByRole('checkbox', { name: 'کل سامانه' })).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(UNDRAWABLE_SCOPES))).toBeNull()
  })

  it('names both grants once the read has failed, rather than drawing them as none', async () => {
    // Half two, and the defect: `data === undefined` is true of *both* states,
    // so gating on it read a 500 as "still loading" and kept quiet for ever.
    // What the administrator saw was two checkboxes — «همهٔ دپارتمان‌ها» and
    // «می‌تواند سرپرست دیگران باشد» — neither ticked, and an account holding
    // `dept:cooking` and `dept:dining/report:steps` reported as holding nothing.
    stubDepartmentsFailed()
    mount(TWO_GRANTS)
    const notice = await screen.findByText(new RegExp(UNDRAWABLE_SCOPES))
    // Both of them, and by the stored spelling: with no registry there is no
    // Persian name to fall back on, and «سالن» printed here would mean the names
    // arrived after all.
    expect(notice).toHaveTextContent('cooking')
    expect(notice).toHaveTextContent('dining')
  })
})

describe('the scope fieldset on a scope the grammar refuses', () => {
  it('names it and quotes it, rather than drawing nothing or calling it everything', async () => {
    // **The fourth shape.** `user_scopes.scope` is `TEXT NOT NULL` with no
    // CHECK, so `''`, `admin` and `dept:Dining` — one capital letter away from a
    // scope that would parse — are all storable today, and `parseScope` refuses
    // all three. Two mutants of that answer were green across the whole suite:
    //
    //   `UserFields`: `if (parsed.shape === 'refused') return true` → `false`
    //     — the row draws no box **and** no notice, so an account covered by
    //       nothing reads as an account somebody simply has not filled in.
    //   `scopeLabel`: the refused branch → `return EVERY_DEPARTMENT`
    //     — covered by nothing, rendered as reaching everything.
    //
    // So the notice has to be there *and* say `dept:Dining`; either assertion
    // alone survives one of the two.
    //
    // Asserted here rather than through a dialog **because no dialog can be
    // given this input**: `mayManage`'s scope clause runs each of the target's
    // scopes through `scopeContains`, which answers `false` for a malformed one
    // even to a `*` holder, so `UserDetail` draws no edit button on such an
    // account and the server answers the same `SCOPE_NOT_COVERED`. This
    // component cannot see its callers' guards, and its promise — a scope it can
    // draw no control for is kept and is never *also* invisible — is its own.
    stubDepartments()
    mount(['dept:Dining'])
    // Waited for a *department block*, not for the notice: the registry has to
    // be fully in hand before any of this means anything, or the assertions
    // below could be true merely of a fieldset that had not loaded yet — which
    // is the state the test above is about and a different fact entirely.
    expect(await screen.findByRole('checkbox', { name: 'سالن' })).not.toBeChecked()
    const notice = screen.getByText(new RegExp(UNDRAWABLE_SCOPES))
    expect(notice).toHaveTextContent('dept:Dining')
    expect(notice).not.toHaveTextContent(EVERY_DEPARTMENT)
    // …and «سالن» is what a form that lower-cased its way out of the problem
    // would have ticked, while `*` is the box the mutant's word belongs to.
    expect(screen.getByRole('checkbox', { name: 'کل سامانه' })).not.toBeChecked()
  })

  it('says nothing about an account whose every scope it can draw', async () => {
    // The separating half. Without it «the notice is present» is an assertion
    // about a paragraph that could be permanent furniture — true of a fieldset
    // that shouts about every ordinary account it ever draws.
    stubDepartments()
    mount(TWO_GRANTS)
    expect(await screen.findByRole('checkbox', { name: 'پخت' })).toBeChecked()
    expect(screen.queryByText(new RegExp(UNDRAWABLE_SCOPES))).toBeNull()
  })
})
