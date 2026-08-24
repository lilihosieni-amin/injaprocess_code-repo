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
  role: 'reader',
  id: 32, username: '09122222222', displayName: 'سحر بیات',
  scopes: ['dept:dining'], canSupervise: true,
}
const KEYVAN: SupervisorCandidate = {
  role: 'admin',
  id: 33, username: '09123333333', displayName: 'کیوان مرادی',
  scopes: ['*'], canSupervise: false,
}
const ARASH: SupervisorCandidate = {
  role: 'editor',
  id: 31, username: '09121111111', displayName: 'آرش تهرانی',
  scopes: ['dept:warehouse'], canSupervise: true,
}

/** A head of two departments. Only a `*` holder covers both, which is why he is
 *  drawn with both of his scopes rather than with the first one. */
const KAVEH: SupervisorCandidate = {
  role: 'admin',
  id: 34, username: '09124444444', displayName: 'کاوه سالاری',
  scopes: ['dept:cashier', 'dept:dining'], canSupervise: true,
}

/*
 * **`RAHA` and `MINA` are gone from this file.**
 *
 * They were a report-scoped account and one holding a scope the grammar
 * refuses, and they existed to drive two branches of `scopeLabel` through the
 * option labels this picker used to draw. The owner's ruling replaced those
 * labels with the ROLE, so neither fixture can reach the branch it was written
 * for from here any more. The assertions moved with the function they were
 * about — `src/lib/scopes.test.ts` — where they no longer need a rendered
 * dropdown to be read off.
 */

/** Forty of them, for the height claim. */
function many(n: number): SupervisorCandidate[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    username: `0912${String(1000000 + i).slice(0, 7)}`,
    displayName: `سرپرست ${i}`,
    role: 'reader',
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

  it('writes each candidate\'s own ROLE beside their own name', async () => {
    // **Owner ruling** — *"the person's name and role should be displayed."*
    // D52 put the SCOPE here, on the argument that past thirty users the reason
    // somebody is on this list is otherwise invisible. It was the wrong answer
    // to a real question: `eligible_supervisors` has already filtered the list
    // to people whose departments cover this account's, so the department
    // printed the same fact against every name.
    //
    // The pairing is still the assertion: a picker that draws every candidate
    // against the FIRST candidate's role passes every «is مدیر on screen» check
    // and fails only this.
    mount({ candidates: [SAHAR, KEYVAN, ARASH] })
    const list = await openList()
    await waitFor(() =>
      expect(within(list).getByRole('option', { name: /سحر بیات\s*—\s*خواننده/ })).toBeInTheDocument())
    expect(within(list).getByRole('option', { name: /کیوان مرادی\s*—\s*مدیر/ })).toBeInTheDocument()
    expect(within(list).getByRole('option', { name: /آرش تهرانی\s*—\s*ادیتور/ })).toBeInTheDocument()
    // …and nobody carries somebody else's.
    expect(within(list).queryByRole('option', { name: /سحر بیات\s*—\s*مدیر/ })).toBeNull()
    expect(within(list).queryByRole('option', { name: /آرش تهرانی\s*—\s*خواننده/ })).toBeNull()
  })

  it('writes no department at all — not even for a head of two', async () => {
    // *"There's no need to display their department."* Asserted on the fixture
    // that made the old label longest, so a half-done change that merely
    // shortened it would still fail here.
    mount({ candidates: [KAVEH] })
    const list = await openList()
    const option = () => within(list).getByRole('option', { name: /کاوه سالاری/ })
    await waitFor(() => expect(option()).toHaveAccessibleName(/مدیر/))
    expect(option()).not.toHaveAccessibleName(/صندوق/)
    expect(option()).not.toHaveAccessibleName(/سالن/)
  })

  it('quotes a role this build has no wording for, rather than blanking it', async () => {
    // `roleLabel` is presentation and a role seeded ahead of the UI keeps its
    // identifier: «—», or an empty run after the dash, would tell an
    // administrator the account has no role, which is a different and false
    // fact. The same rule `lib/roles.ts` states, checked where it is read.
    mount({ candidates: [{ ...SAHAR, role: 'inspector' }] })
    const list = await openList()
    await waitFor(() => expect(within(list).getByRole('option', { name: /سحر بیات/ }))
      .toHaveAccessibleName(/—\s*inspector/))
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

  it('states no rule paragraph any more — owner ruling', () => {
    // §6.14's two sentences («سرپرست باید بالاتر…», «خوانندهٔ گزارش…») are gone
    // with `SUPERVISOR_RULE`. The ruling names the user-detail page's helper
    // texts, and the same message asks for this dialog's errors to be where a
    // person notices them — two sentences of prose above the submit were part
    // of why they were not. What the paragraph explained is still answered
    // where it is asked: an empty list says `NO_CANDIDATE`, a search that
    // misses says `NO_SEARCH_HIT`.
    mount({ candidates: [SAHAR] })
    expect(screen.queryByText(/دپارتمانش دپارتمان او را پوشش دهد/)).toBeNull()
    expect(screen.queryByText(/کامنتی را تأیید نمی‌کند/)).toBeNull()
  })
})
