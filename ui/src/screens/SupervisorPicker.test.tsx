import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
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

/**
 * Somebody holding a scope **the grammar refuses**, which is a stored row and
 * not a hypothesis: `user_scopes.scope` is `TEXT NOT NULL` with no CHECK, so
 * `''`, `dept:Dining` and this — a bare `admin`, the shape a role name written
 * into the scope column would take — are all reachable today.
 *
 * Distinct from `RAHA` above on the one axis that matters here. Hers is a
 * *well-formed* scope carrying a kind this build has no wording for, so it
 * exercises `reportLabel`; this one `parseScope` refuses outright, which is a
 * different branch of `scopeLabel` and the one whose mutant is dangerous:
 * rendered as `EVERY_DEPARTMENT`, an account covered by **nothing** is offered
 * to an administrator as one that reaches **everything**.
 */
const MINA: SupervisorCandidate = {
  id: 36, username: '09127777777', displayName: 'مینا دهقان',
  scopes: ['admin'], canSupervise: true,
}

/** Forty of them, for the height claim. */
function many(n: number): SupervisorCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    username: `0912${String(1000000 + i).slice(0, 7)}`,
    displayName: `سرپرست ${i}`,
    scopes: ['*'],
    canSupervise: true,
  }))
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

/** The one trigger. Its accessible name is «سرپرست» plus whatever is chosen —
 *  label then value, which is what a native <select> announces. */
const trigger = () => screen.getByRole('button', { name: /سرپرست/ })

/** Open the popover and hand back the list inside it. */
async function openList(): Promise<HTMLElement> {
  await userEvent.click(trigger())
  return screen.findByRole('listbox')
}

/** The options as they are on screen, named. Throws on a row it cannot name, so
 *  a fixture that stops appearing is a failure rather than a shortened list. */
const NAMES = ['سحر بیات', 'کیوان مرادی', 'آرش تهرانی', 'کاوه سالاری']
function renderedNames(list: HTMLElement): string[] {
  return within(list).getAllByRole('option').map((o) => {
    const name = NAMES.find((n) => (o.textContent ?? '').includes(n))
    if (!name) throw new Error(`option belongs to no fixture: ${o.textContent}`)
    return name
  })
}

describe('the supervisor picker', () => {
  it('is a searchable dropdown, not an uncapped list of radios in a modal', async () => {
    // F29 — 40 candidates x 49px was ~1960px of radios below an already-1300px
    // scope fieldset, inside one scrolling dialog whose title scrolled away too.
    mount({ candidates: many(40) })
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    const list = await openList()
    // §5.2 Dropdown — `max-height: …; overflow:auto` on the POPOVER, which is
    // the box the list sits in: `role="listbox"` may own only options, so the
    // search field is a sibling and the scroll cap is on their shared parent.
    expect(list.closest('[data-popover]')).toHaveClass('overflow-auto', 'max-h-popover')
    expect(within(list).getAllByRole('option')).toHaveLength(40)
  })

  it('states the empty case in the design\'s words', async () => {
    mount({ candidates: [] })
    await userEvent.click(trigger())
    expect(await screen.findByText('برای این نقش سرپرستی در دسترس نیست')).toBeInTheDocument()
  })

  it('says nobody matched, in the one place a search miss belongs', async () => {
    // A miss and an empty list are different facts. Said with one sentence, an
    // administrator searching «zzz» in a healthy installation is told there is
    // nobody to supervise this account at all.
    mount({ candidates: [SAHAR, KEYVAN, ARASH] })
    await openList()
    await userEvent.type(screen.getByPlaceholderText('نام یا شماره'), 'zzz')
    expect(await screen.findByText('سرپرستی با این نام نیست')).toBeInTheDocument()
    expect(screen.queryByText('برای این نقش سرپرستی در دسترس نیست')).toBeNull()
  })

  it('writes each candidate\'s own scope beside their own name (D52)', async () => {
    // Past thirty users the reason somebody is on this list is otherwise
    // invisible. The pairing is the assertion: a picker that draws every
    // candidate against the *first* candidate's scope passes every «is سالن on
    // screen» check and fails only this.
    mount({ candidates: [SAHAR, KEYVAN, ARASH] })
    const list = await openList()
    await waitFor(() =>
      expect(within(list).getByRole('option', { name: /سحر بیات\s*—\s*سالن/ })).toBeInTheDocument())
    expect(within(list).getByRole('option', { name: /کیوان مرادی\s*—\s*همهٔ دپارتمان‌ها/ })).toBeInTheDocument()
    expect(within(list).getByRole('option', { name: /آرش تهرانی\s*—\s*انبار/ })).toBeInTheDocument()
    // …and nobody carries somebody else's.
    expect(within(list).queryByRole('option', { name: /سحر بیات\s*—\s*انبار/ })).toBeNull()
    expect(within(list).queryByRole('option', { name: /آرش تهرانی\s*—\s*سالن/ })).toBeNull()
  })

  it('names every scope a candidate holds, not just the first', async () => {
    // A head of two departments who is shown as covering one of them is a
    // person an administrator will believe covers less than they do — and the
    // single-scope majority makes `scopes[0]` look right everywhere else.
    mount({ candidates: [KAVEH] })
    const list = await openList()
    await waitFor(() => expect(within(list).getByRole('option', { name: /صندوق/ })).toBeInTheDocument())
    expect(within(list).getByRole('option', { name: /کاوه سالاری/ })).toHaveAccessibleName(/سالن/)
  })

  it('names a report scope in Persian rather than quoting the stored string', async () => {
    // The third shape of the grammar, and the only fixture in this file that
    // reaches it: `scopeLabel` used to render `dept:dining/report:steps` as
    // «سالن/report:steps» — the department translated and the report left in the
    // stored spelling, half a sentence in each language beside somebody's name.
    mount({ candidates: [RAHA] })
    const list = await openList()
    // Waited for the *label*, not merely for the row: `/api/departments` is this
    // component's one request, and until it lands `scopeLabel` falls back to the
    // code — «dining (فقط …)» — which is the honest thing to draw and not what
    // this test is about.
    await waitFor(() => expect(within(list).getByRole('option', { name: /رها فرجی/ }))
      .toHaveAccessibleName(/سالن \(فقط راهنمای گام‌به‌گام\)/))
    // …and not as the whole department, which is more than she reaches.
    expect(within(list).queryByRole('option', { name: /رها فرجی\s*—\s*سالن$/ })).toBeNull()
  })

  it('quotes a scope the grammar refuses, rather than calling it everything', async () => {
    // **The fourth shape, and the only one whose mutant is an escalation on
    // screen.** `scopeLabel`'s refused branch returning `EVERY_DEPARTMENT`
    // instead of the stored string left the whole frontend suite green while
    // writing «مینا دهقان — همهٔ دپارتمان‌ها» beside somebody covered by
    // nothing at all — in the one list an administrator picks an org-chart edge
    // out of, where a `*` holder is exactly who they are looking for.
    mount({ candidates: [MINA] })
    const list = await openList()
    await waitFor(() => expect(within(list).getByRole('option', { name: /مینا دهقان/ }))
      .toHaveAccessibleName(/—\s*admin/))
    expect(within(list).getByRole('option', { name: /مینا دهقان/ }))
      .not.toHaveAccessibleName(/همهٔ دپارتمان‌ها/)
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
    const list = await openList()
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(3))
    expect(renderedNames(list)).toEqual(['سحر بیات', 'کیوان مرادی', 'آرش تهرانی'])
  })

  it('offers no “no supervisor” choice to a user who does not reach everything (D51)', async () => {
    mount({ candidates: [SAHAR], allowNone: false })
    const list = await openList()
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(1))
    expect(within(list).queryByRole('option', { name: 'بدون سرپرست' })).toBeNull()
    // …and the trigger says nothing has been chosen, rather than reading as the
    // state this account may not be in.
    expect(trigger()).toHaveAccessibleName(/انتخاب کنید/)
  })

  it('offers it to a user who does', async () => {
    // The other half of the pair. D51 makes "no supervisor" legal for a
    // `*`-scoped account and for nobody else, so a picker that always offers it
    // — or never does — is wrong for half the accounts in the installation.
    mount({ candidates: [SAHAR], allowNone: true })
    const list = await openList()
    expect(within(list).getByRole('option', { name: 'بدون سرپرست' })).toBeInTheDocument()
    // …and it is what the trigger already reads, because `null` IS that state
    // for such an account and is what this form would send.
    expect(trigger()).toHaveAccessibleName(/بدون سرپرست/)
  })

  it('starts on the person creating the account, when they are eligible', async () => {
    mount({ candidates: [SAHAR, KEYVAN, ARASH], preferred: KEYVAN.username })
    await waitFor(() => expect(trigger()).toHaveAccessibleName(/کیوان مرادی/))
    expect(trigger()).not.toHaveAccessibleName(/سحر بیات/)
    expect(trigger()).not.toHaveAccessibleName(/آرش تهرانی/)
  })

  it('starts on nobody when the creator is not eligible, rather than on whoever is first', async () => {
    // **The mutant this exists for**: a default of `candidates[0]`, or of "the
    // creator if present else the first row", quietly proposes somebody the
    // administrator never chose — and the org chart is the one thing on this
    // form nobody re-reads afterwards.
    mount({ candidates: [SAHAR, KEYVAN, ARASH], preferred: '09129999999' })
    const list = await openList()
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(3))
    for (const option of within(list).getAllByRole('option')) {
      expect(option).toHaveAttribute('aria-selected', 'false')
    }
  })

  it('does not overwrite a choice the administrator has already made', async () => {
    mount({ candidates: [SAHAR, KEYVAN, ARASH], preferred: KEYVAN.username, initial: ARASH.id })
    await waitFor(() => expect(trigger()).toHaveAccessibleName(/آرش تهرانی/))
    expect(trigger()).not.toHaveAccessibleName(/کیوان مرادی/)
  })

  it('marks the chosen candidate and only them', async () => {
    mount({ candidates: [SAHAR, KEYVAN, ARASH] })
    const list = await openList()
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(3))
    await userEvent.click(within(list).getByRole('option', { name: /سحر بیات/ }))
    const reopened = await openList()
    expect(within(reopened).getByRole('option', { name: /سحر بیات/ }))
      .toHaveAttribute('aria-selected', 'true')
    expect(within(reopened).getByRole('option', { name: /کیوان مرادی/ }))
      .toHaveAttribute('aria-selected', 'false')
    expect(within(reopened).getByRole('option', { name: /آرش تهرانی/ }))
      .toHaveAttribute('aria-selected', 'false')
  })

  it('narrows the list by name', async () => {
    mount({ candidates: [SAHAR, KEYVAN, ARASH] })
    const list = await openList()
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(3))
    await userEvent.type(screen.getByPlaceholderText('نام یا شماره'), 'کیوان')
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(1))
    expect(within(list).getByRole('option', { name: /کیوان مرادی/ })).toBeInTheDocument()
  })

  it('narrows it by the number however the digits were typed', async () => {
    // Ordinary Persian keyboards emit ۰۹…, and the stored number is ASCII (D57).
    // Unfolded, searching for a colleague's own number returns nothing at all —
    // and looks exactly like "this person cannot supervise".
    mount({ candidates: [SAHAR, KEYVAN, ARASH] })
    const list = await openList()
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(3))
    await userEvent.type(screen.getByPlaceholderText('نام یا شماره'), '۱۱۱۱')
    await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(1))
    expect(within(list).getByRole('option', { name: /آرش تهرانی/ })).toBeInTheDocument()
  })

  it('says so when the person already supervising is not on the list, instead of showing nothing selected', async () => {
    // D14 leaves a disabled supervisor in place rather than repointing the
    // people under them, so an edit form really does open with a supervisor who
    // is not a candidate. Drawn as "nothing chosen" it reads as "this user has
    // no supervisor", and the administrator's next save would be the one that
    // makes that true. `staysPut` defaults true here, which is that save's
    // shape: neither the edge nor the scopes moving.
    mount({ candidates: [SAHAR, KEYVAN], initial: 99 })
    expect(await screen.findByText(/سرپرست کنونی در این فهرست نیست/)).toBeInTheDocument()
    expect(trigger()).toHaveAccessibleName(/انتخاب کنید/)
  })

  it('says nothing of the kind when the chosen candidate is on the list', async () => {
    // The note must be the consequence of an absent candidate, not furniture
    // that is always in the DOM — which would pass the test above for the wrong
    // reason.
    mount({ candidates: [SAHAR, KEYVAN], initial: SAHAR.id })
    await waitFor(() => expect(trigger()).toHaveAccessibleName(/سحر بیات/))
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
    await waitFor(() => expect(trigger()).toHaveAccessibleName(/انتخاب کنید/))
    expect(screen.queryByText(/سرپرست کنونی در این فهرست نیست/)).toBeNull()
  })

  it('states the rule that makes this list this short (§6.14)', async () => {
    mount({ candidates: [SAHAR] })
    expect(await screen.findByText(/دپارتمانش دپارتمان او را پوشش دهد/)).toBeInTheDocument()
    expect(screen.getByText(/کامنتی را تأیید نمی‌کند/)).toBeInTheDocument()
  })

  it('states §6.14’s two sentences and no third — owner ruling R32', async () => {
    // A third clause saying the choice grants no access was written here and
    // the owner removed it: the deliverable wins on content, and this picker is
    // not where a permission model gets explained. Pinned in BOTH directions —
    // the two sentences must be present AND the removed one absent — because a
    // later reader of D51 would otherwise have every reason to add it back.
    mount({ candidates: [SAHAR] })
    expect(await screen.findByText(/دپارتمانش دپارتمان او را پوشش دهد/)).toBeInTheDocument()
    expect(screen.getByText(/کامنتی را تأیید نمی‌کند/)).toBeInTheDocument()
    expect(screen.queryByText(/هیچ دسترسی‌ای نمی‌دهد/)).toBeNull()
  })
})
