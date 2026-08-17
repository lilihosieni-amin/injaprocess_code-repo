import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SupervisorPicker } from './SupervisorPicker'
import type { SupervisorCandidate } from '../api/users'

afterEach(() => {
  vi.restoreAllMocks()
  // `restoreAllMocks` does not undo `stubGlobal`, and `vite.config.ts` sets no
  // `unstubGlobals`, so a `fetch` installed by one block would otherwise stay
  // installed for every block after it.
  vi.unstubAllGlobals()
})

const JSON_HEAD = { 'Content-Type': 'application/json' }
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: JSON_HEAD })

/** The departments the scope labels are read from. `/api/departments` is the
 *  only request this component makes; everything else arrives as props. */
const DEPARTMENTS = [
  { code: 'warehouse', name: 'انبار', count: 0, subs: 0 },
  { code: 'dining', name: 'سالن', count: 0, subs: 0 },
  { code: 'cashier', name: 'صندوق', count: 0, subs: 0 },
]

function stubDepartments() {
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    if (path === '/api/departments') return json(DEPARTMENTS)
    throw new Error(`unexpected request: ${path}`)
  }))
}

/**
 * **Three candidates, and the middle one is middle on every field the picker
 * draws.** Sahar's id, number, display name and scope label all sit strictly
 * between Arash's and Keyvan's — and the three first letters (آ U+0622, س
 * U+0633, ک U+06A9) order the same way under a code-unit sort and under Persian
 * collation, so "middle" is not an artefact of which comparator is used.
 *
 * Handed to the picker **first**, Sahar is therefore in a position no sort can
 * produce: a sort in either direction opens with an extreme. `canSupervise` is
 * the one field that cannot be "between", so the three values spell T, F, T in
 * the given order — which is neither [F,T,T] nor [T,T,F], the only two orders a
 * stable sort on that flag can produce.
 *
 * Two rows could not do this: with two, "not ascending" *is* "descending", and
 * a reversed comparator is the commonest way to get an order wrong.
 */
const SAHAR: SupervisorCandidate = {
  id: 32, username: '09122222222', displayName: 'سحر بیات',
  scopes: ['dept:dining'], canSupervise: true,
}
const KEYVAN: SupervisorCandidate = {
  id: 33, username: '09123333333', displayName: 'کیوان مرادی',
  scopes: ['*'], canSupervise: false,
}
const ARASH: SupervisorCandidate = {
  id: 31, username: '09121111111', displayName: 'آرش تهرانی',
  scopes: ['dept:warehouse'], canSupervise: true,
}

/** A head of two departments. Only a `*` holder covers both, which is why he is
 *  drawn with both of his scopes rather than with the first one. */
const KAVEH: SupervisorCandidate = {
  id: 34, username: '09124444444', displayName: 'کاوه سالاری',
  scopes: ['dept:cashier', 'dept:dining'], canSupervise: true,
}

/** Somebody scoped to **one report of one department** — the third shape of the
 *  grammar. `eligible_supervisors` really can return one: containment is what
 *  the rule asks, so a report-scoped account may supervise somebody holding the
 *  same report. */
const RAHA: SupervisorCandidate = {
  id: 35, username: '09126666666', displayName: 'رها فرجی',
  scopes: ['dept:dining/report:steps'], canSupervise: true,
}

/** `staysPut` defaults to true — the edit-form case the component was written
 *  for, an existing account whose supervisor and scopes are both unchanged. The
 *  one test below that passes `false` is what separates the note's guard from
 *  its absence. */
function Harness({ candidates, allowNone = false, staysPut = true, preferred, initial = null }: {
  candidates: SupervisorCandidate[]
  allowNone?: boolean
  staysPut?: boolean
  preferred?: string
  initial?: number | null
}) {
  const [value, setValue] = useState<number | null>(initial)
  return (
    <SupervisorPicker candidates={candidates} value={value} onChange={setValue}
      allowNone={allowNone} staysPut={staysPut} preferred={preferred} pending={false} />
  )
}

function mount(props: Parameters<typeof Harness>[0]) {
  stubDepartments()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><Harness {...props} /></QueryClientProvider>,
  )
}

/** The options as they are on screen, named. Throws on a row it cannot name, so
 *  a fixture that stops appearing is a failure rather than a shortened list. */
const NAMES = ['سحر بیات', 'کیوان مرادی', 'آرش تهرانی', 'کاوه سالاری']
function renderedNames(): string[] {
  return screen.getAllByRole('radio').map((r) => {
    const name = NAMES.find((n) => (r.getAttribute('aria-label') ?? r.closest('label')?.textContent ?? '').includes(n))
    if (!name) throw new Error(`option belongs to no fixture: ${r.closest('label')?.textContent}`)
    return name
  })
}

describe('the supervisor picker', () => {
  it('writes each candidate\'s own scope beside their own name (D52)', async () => {
    // Past thirty users the reason somebody is on this list is otherwise
    // invisible. The pairing is the assertion: a picker that draws every
    // candidate against the *first* candidate's scope passes every «is سالن on
    // screen» check and fails only this.
    mount({ candidates: [SAHAR, KEYVAN, ARASH] })
    await waitFor(() => expect(screen.getByRole('radio', { name: /سحر بیات\s*—\s*سالن/ })).toBeInTheDocument())
    expect(screen.getByRole('radio', { name: /کیوان مرادی\s*—\s*همهٔ دپارتمان‌ها/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /آرش تهرانی\s*—\s*انبار/ })).toBeInTheDocument()
    // …and nobody carries somebody else's.
    expect(screen.queryByRole('radio', { name: /سحر بیات\s*—\s*انبار/ })).toBeNull()
    expect(screen.queryByRole('radio', { name: /آرش تهرانی\s*—\s*سالن/ })).toBeNull()
  })

  it('names every scope a candidate holds, not just the first', async () => {
    // A head of two departments who is shown as covering one of them is a
    // person an administrator will believe covers less than they do — and the
    // single-scope majority makes `scopes[0]` look right everywhere else.
    mount({ candidates: [KAVEH] })
    await waitFor(() => expect(screen.getByRole('radio', { name: /صندوق/ })).toBeInTheDocument())
    expect(screen.getByRole('radio', { name: /کاوه سالاری/ })).toHaveAccessibleName(/سالن/)
  })

  it('names a report scope in Persian rather than quoting the stored string', async () => {
    // The third shape of the grammar, and the only fixture in this file that
    // reaches it: `scopeLabel` used to render `dept:dining/report:steps` as
    // «سالن/report:steps» — the department translated and the report left in the
    // stored spelling, half a sentence in each language beside somebody's name.
    // Parenthesised, because `scopesLabel` joins with «، » and «سالن، فقط X»
    // cannot be read back as one scope.
    mount({ candidates: [RAHA] })
    // Waited for the *label*, not merely for the row: `/api/departments` is this
    // component's one request, and until it lands `scopeLabel` falls back to the
    // code — «dining (فقط …)» — which is the honest thing to draw and not what
    // this test is about.
    await waitFor(() => expect(screen.getByRole('radio', { name: /رها فرجی/ }))
      .toHaveAccessibleName(/سالن \(فقط راهنمای گام‌به‌گام\)/))
    // …and not as the whole department, which is more than she reaches.
    expect(screen.queryByRole('radio', { name: /رها فرجی\s*—\s*سالن$/ })).toBeNull()
  })

  it('keeps the server\'s order, re-sorting nothing', async () => {
    // `eligible_supervisors` orders by username and says why: an unordered
    // SELECT moves a picker's first entry — its default — between two identical
    // requests. A picker that re-sorts puts that back.
    //
    // See the fixture comment: Sahar is sent first and is the middle value on
    // every field drawn here, so no sort in either direction can reproduce this
    // list.
    mount({ candidates: [SAHAR, KEYVAN, ARASH] })
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(3))
    expect(renderedNames()).toEqual(['سحر بیات', 'کیوان مرادی', 'آرش تهرانی'])
  })

  it('offers no “no supervisor” choice to a user who does not reach everything (D51)', async () => {
    mount({ candidates: [SAHAR], allowNone: false })
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(1))
    expect(screen.queryByRole('radio', { name: 'بدون سرپرست' })).toBeNull()
  })

  it('offers it to a user who does', async () => {
    // The other half of the pair. D51 makes "no supervisor" legal for a
    // `*`-scoped account and for nobody else, so a picker that always offers it
    // — or never does — is wrong for half the accounts in the installation.
    mount({ candidates: [SAHAR], allowNone: true })
    expect(await screen.findByRole('radio', { name: 'بدون سرپرست' })).toBeInTheDocument()
  })

  it('starts on the person creating the account, when they are eligible', async () => {
    mount({ candidates: [SAHAR, KEYVAN, ARASH], preferred: KEYVAN.username })
    await waitFor(() => expect(screen.getByRole('radio', { name: /کیوان مرادی/ })).toBeChecked())
    expect(screen.getByRole('radio', { name: /سحر بیات/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /آرش تهرانی/ })).not.toBeChecked()
  })

  it('starts on nobody when the creator is not eligible, rather than on whoever is first', async () => {
    // **The mutant this exists for**: a default of `candidates[0]`, or of "the
    // creator if present else the first row", quietly proposes somebody the
    // administrator never chose — and the org chart is the one thing on this
    // form nobody re-reads afterwards.
    mount({ candidates: [SAHAR, KEYVAN, ARASH], preferred: '09129999999' })
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(3))
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked()
  })

  it('does not overwrite a choice the administrator has already made', async () => {
    mount({ candidates: [SAHAR, KEYVAN, ARASH], preferred: KEYVAN.username, initial: ARASH.id })
    await waitFor(() => expect(screen.getByRole('radio', { name: /آرش تهرانی/ })).toBeChecked())
    expect(screen.getByRole('radio', { name: /کیوان مرادی/ })).not.toBeChecked()
  })

  it('marks the chosen candidate and only them', async () => {
    mount({ candidates: [SAHAR, KEYVAN, ARASH] })
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(3))
    await userEvent.click(screen.getByRole('radio', { name: /سحر بیات/ }))
    expect(screen.getByRole('radio', { name: /سحر بیات/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /کیوان مرادی/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /آرش تهرانی/ })).not.toBeChecked()
  })

  it('narrows the list by name', async () => {
    mount({ candidates: [SAHAR, KEYVAN, ARASH] })
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(3))
    await userEvent.type(screen.getByLabelText('جست‌وجوی سرپرست'), 'کیوان')
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(1))
    expect(screen.getByRole('radio', { name: /کیوان مرادی/ })).toBeInTheDocument()
  })

  it('narrows it by the number however the digits were typed', async () => {
    // Ordinary Persian keyboards emit ۰۹…, and the stored number is ASCII (D57).
    // Unfolded, searching for a colleague's own number returns nothing at all —
    // and looks exactly like "this person cannot supervise".
    mount({ candidates: [SAHAR, KEYVAN, ARASH] })
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(3))
    await userEvent.type(screen.getByLabelText('جست‌وجوی سرپرست'), '۱۱۱۱')
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(1))
    expect(screen.getByRole('radio', { name: /آرش تهرانی/ })).toBeInTheDocument()
  })

  it('says so when the person already supervising is not on the list, instead of showing nothing selected', async () => {
    // D14 leaves a disabled supervisor in place rather than repointing the
    // people under them, so an edit form really does open with a supervisor who
    // is not a candidate. Drawn as "nothing chosen" it reads as "this user has
    // no supervisor", and the administrator's next save would be the one that
    // makes that true. `staysPut` defaults true here, which is that save's
    // shape: neither the edge nor the scopes moving.
    mount({ candidates: [SAHAR, KEYVAN], initial: 99 })
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(2))
    expect(screen.getByText(/سرپرست کنونی در این فهرست نیست/)).toBeInTheDocument()
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked()
  })

  it('says nothing of the kind when the chosen candidate is on the list', async () => {
    // The note must be the consequence of an absent candidate, not furniture
    // that is always in the DOM — which would pass the test above for the wrong
    // reason.
    mount({ candidates: [SAHAR, KEYVAN], initial: SAHAR.id })
    await waitFor(() => expect(screen.getByRole('radio', { name: /سحر بیات/ })).toBeChecked())
    expect(screen.queryByText(/سرپرست کنونی در این فهرست نیست/)).toBeNull()
  })

  it('says nothing of the kind when this save would not leave them where they are', async () => {
    // **The input the guard exists for**, and the same off-list value as the
    // test above: the note promises «تا وقتی تغییرش ندهید همان‌جا می‌ماند», and
    // that is a lie in the two cases `staysPut` is false in — the create form,
    // where there is no account for anyone to stay on, and an edit that moves
    // the scopes, where the edge is re-judged against the new ones and the save
    // is refused rather than left alone. Only the value off the list is drawn
    // here, so an unguarded note passes every other test in this file.
    mount({ candidates: [SAHAR, KEYVAN], initial: 99, staysPut: false })
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(2))
    expect(screen.queryByText(/سرپرست کنونی در این فهرست نیست/)).toBeNull()
  })

  it('says nobody is eligible rather than drawing an empty box', async () => {
    mount({ candidates: [] })
    expect(await screen.findByText(/کسی نمی‌تواند سرپرست این کاربر باشد/)).toBeInTheDocument()
  })

  it('says the supervisor grants nothing (D51)', async () => {
    // It routes comment approval and confers no capability, no scope and no
    // rank. Drawn beside a role picker with no qualification it reads as a
    // permission, and would then be chosen to give somebody something.
    mount({ candidates: [SAHAR] })
    expect(await screen.findByText(/هیچ دسترسی‌ای نمی‌دهد/)).toBeInTheDocument()
  })
})
