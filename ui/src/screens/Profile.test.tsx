import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Profile } from './Profile'
import { PanelShell } from '../shell/PanelShell'
import { ReaderShell } from '../shell/ReaderShell'
import { MIN_PASSWORD } from '../lib/userDraft'
import type { Capability, SessionDescriptor } from '../auth/session'

let session: SessionDescriptor | undefined
vi.mock('../auth/useSession', () => ({ useSession: () => ({ data: session }) }))

afterEach(() => {
  vi.restoreAllMocks()
  // `restoreAllMocks` does not undo `stubGlobal` and `vite.config.ts` sets no
  // `unstubGlobals`, so without this the `fetch` one block installed is still
  // installed for every block after it.
  vi.unstubAllGlobals()
})

const JSON_HEAD = { 'Content-Type': 'application/json' }
const json = (body: unknown, status = 200, statusText = '') =>
  new Response(JSON.stringify(body), { status, statusText, headers: JSON_HEAD })

/** A Reader: no administration capability whatever. The profile screen is the
 *  one surface in this sub-project that is **not** gated, so the actor
 *  everything below runs as is the one who holds the least. */
const READER: SessionDescriptor = {
  username: '09121111111', displayName: 'سحر بیات', role: 'reader',
  capabilities: ['view', 'comment', 'export_pdf'],
  scopes: ['dept:cooking'], supervisor: '09120000000',
  canSupervise: false, pendingApprovals: 0,
}

/** An Editor: §6.13's own screenshot signs in as one, and Step 5's
 *  «ادیتور» role label only ever comes from this role (`lib/roles.ts`). */
const EDITOR: SessionDescriptor = {
  username: '09123334455', displayName: 'ویدا مهرآیین', role: 'editor',
  capabilities: ['view', 'comment', 'edit', 'confirm'],
  scopes: ['dept:cooking'], supervisor: '09120000000',
  canSupervise: false, pendingApprovals: 0,
}

const CURRENT = 'گذرواژهٔ فعلی'
const NEXT = 'گذرواژهٔ تازه'
const REPEAT = 'تکرار گذرواژهٔ تازه'
/** «ذخیرهٔ گذرواژه» — §6.13's own submit label. The screen's older,
 *  pre-rebuild draft said «تغییر گذرواژه»; every test below reads the label
 *  through this constant rather than the literal so the rename is one line. */
const SUBMIT = 'ذخیرهٔ گذرواژه'

/**
 * Three values that are **pairwise different and all long enough**, so that
 * every rule this screen has is satisfied and only the plumbing is under test.
 *
 * `OLD` and `NEW` differ in every character position that matters: a body which
 * sent one where the other belongs, or which sent the same field twice, changes
 * what `toEqual` sees. Two values differing only in length would let a swap
 * through any assertion that merely counted characters.
 */
const OLD = 'oldpass-aaa'
const NEW = 'newpass-zzz'

type Write = { path: string; method: string; body: unknown }

/**
 * `POST /api/auth/password` as the real one answers: **204 on success**, and a
 * **400** carrying a Persian sentence for either refusal it decides itself —
 * the wrong current password and the six-character floor
 * (`auth.apply_password_change`). Not 401: the caller's session is fine, the
 * body is not, and `fetchJson` turns a 401 into the shell's redirect.
 */
function stubServer(opts: {
  status?: number
  detail?: unknown
  statusText?: string
  /** Leave the request in flight until `release()` is called. */
  hang?: boolean
} = {}) {
  const writes: Write[] = []
  let unblock: () => void = () => {}
  vi.stubGlobal('fetch', vi.fn(async (path: string, init?: RequestInit) => {
    writes.push({
      path,
      method: init?.method ?? 'GET',
      body: init?.body === undefined ? null : JSON.parse(String(init.body)),
    })
    if (opts.hang) await new Promise<void>((resolve) => { unblock = resolve })
    const status = opts.status ?? 204
    if (status >= 400) return json({ detail: opts.detail ?? 'نه' }, status, opts.statusText)
    return new Response(null, { status: 204 })
  }))
  return { writes, release: () => unblock() }
}

function mountProfile() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/profile']}>
        <Routes><Route path="/profile" element={<Profile />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Stubs the server and mounts in one call, for the tests below that only
 *  read the drawn screen and never inspect a request. `session` is set first
 *  so the mocked `useSession` sees it on the render `mountProfile` triggers. */
function drawProfile(s: SessionDescriptor) {
  session = s
  stubServer()
  return mountProfile()
}

/** Fill the form. Every argument is explicit — a helper that defaulted the
 *  repeat to the new password would make «the confirmation is compared» a
 *  statement this file could not test. */
async function fill(current: string, next: string, repeat: string) {
  if (current) await userEvent.type(await screen.findByLabelText(CURRENT), current)
  if (next) await userEvent.type(screen.getByLabelText(NEXT), next)
  if (repeat) await userEvent.type(screen.getByLabelText(REPEAT), repeat)
}

const submit = () => userEvent.click(screen.getByRole('button', { name: SUBMIT }))

beforeEach(() => { session = READER })

describe('the profile form', () => {
  it('labels all three fields, each on an input of its own', async () => {
    stubServer()
    mountProfile()
    const fields = [
      await screen.findByLabelText(CURRENT),
      screen.getByLabelText(NEXT),
      screen.getByLabelText(REPEAT),
    ]
    // Three distinct elements: two labels pointing at one input reads as three
    // fields to anybody looking at the screen and to `getByLabelText` alike,
    // and would then send whichever value was typed last as both.
    expect(new Set(fields).size).toBe(3)
  })

  it('masks all three fields', async () => {
    // An earlier screen in this project shipped `type="text"` and passed every
    // test in its file, because each of them read the field by its label —
    // which works exactly the same either way. Nothing but the attribute sees
    // this.
    stubServer()
    mountProfile()
    expect(await screen.findByLabelText(CURRENT)).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText(NEXT)).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText(REPEAT)).toHaveAttribute('type', 'password')
  })

  it('offers the current field to a password manager as the current one, not the new one', async () => {
    // `autoComplete="current-password"` vs. `"new-password"` is what tells a
    // password manager which value to offer where; jsdom does not act on it,
    // so nothing but this assertion sees a mix-up — and the browser-only
    // consequence is a manager offering to save the OLD password as the NEW
    // one on the current field.
    stubServer()
    mountProfile()
    expect(await screen.findByLabelText(CURRENT)).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByLabelText(NEXT)).toHaveAttribute('autocomplete', 'new-password')
    expect(screen.getByLabelText(REPEAT)).toHaveAttribute('autocomplete', 'new-password')
  })

  it('does not cap a field short enough to set a different password than was typed', async () => {
    // Asserted on the attribute, never by typing: jsdom does not enforce
    // `maxLength` at all, so a cap would truncate in a browser while every
    // runnable test stayed green — and the account would then hold a password
    // its owner cannot type.
    stubServer()
    mountProfile()
    for (const label of [CURRENT, NEXT, REPEAT]) {
      const cap = (await screen.findByLabelText(label)).getAttribute('maxLength')
      expect(cap === null || Number(cap) >= 64, `${label} is capped at ${cap}`).toBe(true)
    }
  })

  it('gives its control its own horizontal padding and type size', async () => {
    // `Button`'s BASE carries neither on purpose (I5) — the call site owns both
    // — so a bare `<Button>` is a 44 px box with its text against the edges.
    // jsdom measures nothing, so the class is all any runnable test can see.
    //
    // The type class itself moved from the pre-rebuild `text-caption` family
    // to the theme's `text-fs-*` scale (`text-fs-menu`, §6.13's own button
    // copy size) when this screen was rebuilt — this pattern, not the exact
    // name, is what the test pins.
    stubServer()
    mountProfile()
    const button = await screen.findByRole('button', { name: SUBMIT })
    expect(button.className).toMatch(/(^|\s)px-/)
    expect(button.className).toMatch(/(^|\s)text-fs-\w/)
  })

  it('writes nothing but the password: no control here besides the three fields, their reveal toggles and the submit button', async () => {
    // D13 forbids every other route to self-modification, and this screen's
    // whole reason to exist is being the single exception for password only —
    // name, number, role and scope are read-only prose above the form. A
    // `<select>` or a second text input added beside them, wired to PATCH
    // anything, would BE that second route, and nothing else in this file
    // would notice: the read-only facts are found with `getByText`, which is
    // blind to an extra *interactive* control sitting next to them. So this
    // asserts the writable surface itself, positively and exhaustively,
    // rather than the wording around it.
    //
    // `PasswordField` — the shared component §6.13's rebuild moved this screen
    // onto — draws its own show/hide toggle per field (§5.2's reveal
    // affordance), so the button count is four, not one: three `type="button"`
    // reveal toggles (each `aria-pressed`, which nothing else on this screen
    // is) plus the one `type="submit"`. That is still exhaustive: a stray
    // `<select>` or extra text input would still show up as a control this
    // list does not account for.
    stubServer()
    const { container } = mountProfile()
    await screen.findByLabelText(CURRENT)
    expect(screen.queryAllByRole('textbox')).toEqual([])
    expect(screen.queryAllByRole('combobox')).toEqual([])
    expect(screen.queryAllByRole('checkbox')).toEqual([])
    expect(screen.queryAllByRole('radio')).toEqual([])
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(4)
    const submitButtons = buttons.filter((b) => b.getAttribute('type') === 'submit')
    expect(submitButtons).toHaveLength(1)
    const revealButtons = buttons.filter((b) => b.hasAttribute('aria-pressed'))
    expect(revealButtons).toHaveLength(3)
    // Password inputs expose no ARIA role at all (confirmed empirically: an
    // `<input type="password">` matches none of `getByRole('textbox')` and
    // friends above), so the three fields have to be counted a different way
    // — every form control in the DOM, positively enumerated and typed.
    const controls = container.querySelectorAll('input, select, textarea')
    expect(controls).toHaveLength(3)
    for (const el of controls) expect(el).toHaveAttribute('type', 'password')
  })
})

describe('changing your own password', () => {
  it('sends the current password and the new one, each in its own field', async () => {
    // The whole body, compared with `toEqual`: `current` and `next` swapped is
    // a request the server answers «گذرواژهٔ فعلی درست نیست» to, which reads on
    // screen as the person having mistyped their own password. A `toMatchObject`
    // here would also miss a third field carrying the repeat.
    const seen = stubServer()
    mountProfile()
    await fill(OLD, NEW, NEW)
    await submit()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].path).toBe('/api/auth/password')
    expect(seen.writes[0].method).toBe('POST')
    expect(seen.writes[0].body).toEqual({ current: OLD, next: NEW })
  })

  it('sends nothing when the repeat does not match the new password', async () => {
    // Both values clear the length floor and neither equals the current
    // password, so a mismatch is the only rule that can fire here.
    const seen = stubServer()
    mountProfile()
    await fill(OLD, NEW, 'newpass-zzy')
    await submit()
    expect(await screen.findByRole('alert'))
      .toHaveTextContent('گذرواژهٔ تازه و تکرار آن یکی نیستند')
    expect(seen.writes).toEqual([])
  })

  it('compares the repeat against the NEW password, not against the current one', async () => {
    // The mismatch test above passes just as well against a screen that
    // compared the repeat with the *current* password — both comparisons refuse
    // that input. This one separates them: the repeat matches the new password
    // and differs from the current one, which is the ordinary case, and a
    // wrongly-wired comparison refuses it.
    const seen = stubServer()
    mountProfile()
    await fill(OLD, NEW, NEW)
    await submit()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('refuses a new password under the floor without spending an argon2 hash on it', async () => {
    // The endpoint runs a verify AND a hash — ~122 ms on the shared limiter
    // (`auth.VERIFY_LIMITER`) — before it can say what the field already knows.
    const seen = stubServer()
    mountProfile()
    const short = 'a'.repeat(MIN_PASSWORD - 1)
    await fill(OLD, short, short)
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('گذرواژه باید دست‌کم ۶ نویسه باشد')
    expect(seen.writes).toEqual([])
  })

  it('accepts a password of exactly the floor, so the local rule is not stricter than the server\'s', async () => {
    // A local floor of seven refuses a password the server would have stored,
    // and refuses it without sending anything — invisible to every test that
    // only checks that five characters are refused.
    const seen = stubServer()
    mountProfile()
    const exact = 'a'.repeat(MIN_PASSWORD)
    await fill(OLD, exact, exact)
    await submit()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(seen.writes[0].body).toEqual({ current: OLD, next: exact })
  })

  it('uses the server\'s own floor', () => {
    // `auth.MIN_PASSWORD_LENGTH` is 6 (D58). The two boundary tests above are
    // written in terms of this constant, so they hold whatever it says — which
    // is exactly why the constant itself has to be pinned to the server's
    // number somewhere, or a floor of 8 satisfies both of them.
    expect(MIN_PASSWORD).toBe(6)
  })

  it('asks for the current password before it sends anything', async () => {
    // Left blank the server answers 400 «گذرواژهٔ فعلی درست نیست», after the
    // same ~122 ms — and the sentence blames a value the person never typed.
    const seen = stubServer()
    mountProfile()
    await fill('', NEW, NEW)
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('گذرواژهٔ فعلی خود را بنویسید')
    expect(seen.writes).toEqual([])
  })

  it('leads with the empty-current refusal when the new password is also too short', async () => {
    // Each of the three local rules above is exercised with an input that can
    // trip only IT — which is exactly why none of them pins the order the
    // code's own comments argue for ("length before the repeat, so that two
    // identical short values are told the thing that is actually wrong with
    // them" — and empty-current before that, so a request that cannot
    // possibly be accepted never reaches the length check either). Only an
    // input that trips two rules at once makes the order observable: current
    // left blank AND the new password under the floor.
    const seen = stubServer()
    mountProfile()
    const short = 'a'.repeat(MIN_PASSWORD - 1)
    await fill('', short, short)
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('گذرواژهٔ فعلی خود را بنویسید')
    expect(seen.writes).toEqual([])
  })

  it('repeats the server\'s sentence when the current password is wrong, and claims no success', async () => {
    // The server's own words, because they name which of the two fields to
    // correct. «انجام نشد» in their place leaves somebody retyping the new
    // password over and over.
    stubServer({ status: 400, detail: 'گذرواژهٔ فعلی درست نیست' })
    mountProfile()
    await fill(OLD, NEW, NEW)
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('گذرواژهٔ فعلی درست نیست')
    expect(screen.queryByText(/گذرواژهٔ شما عوض شد/)).toBeNull()
  })

  it('does not put a framework\'s English on a Persian screen when a 4xx carries no sentence', async () => {
    // A 4xx is not a promise that a Persian sentence was written: FastAPI's own
    // validation layer answers 422 with `detail` as a **list**, which
    // `fetchJson` cannot read a sentence out of, so it falls back to
    // `res.statusText`.
    stubServer({
      status: 422,
      detail: [{ type: 'missing', loc: ['body', 'current'], msg: 'Field required' }],
      statusText: 'Unprocessable Entity',
    })
    mountProfile()
    await fill(OLD, NEW, NEW)
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('انجام نشد؛ دوباره تلاش کنید.')
    expect(screen.queryByText(/Unprocessable Entity/)).toBeNull()
    expect(screen.queryByText(/Field required/)).toBeNull()
  })

  it('says the same for a 5xx, and claims nothing about the password', async () => {
    // An unhandled exception behind FastAPI answers `{"detail": "Internal
    // Server Error"}` — a `detail` that IS a string and is still nobody's
    // sentence. Reporting an outage as "your current password is wrong" sends
    // somebody to ask for a reset they never needed.
    stubServer({ status: 500, detail: 'Internal Server Error', statusText: 'Internal Server Error' })
    mountProfile()
    await fill(OLD, NEW, NEW)
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('انجام نشد؛ دوباره تلاش کنید.')
    expect(screen.queryByText(/Internal Server Error/)).toBeNull()
    expect(screen.queryByText(/گذرواژهٔ شما عوض شد/)).toBeNull()
  })

  it('confirms the change, and says the other devices are out', async () => {
    stubServer()
    mountProfile()
    await fill(OLD, NEW, NEW)
    await submit()
    expect(await screen.findByText(/گذرواژهٔ شما عوض شد/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('دستگاه‌های دیگر از این حساب بیرون آمدند')
  })

  it('drops the success confirmation the moment a later attempt is refused locally', async () => {
    // `change.isSuccess` stays true after a successful mutation — react-query
    // does not clear it just because a *later* submit never reaches
    // `mutate` — so the confirmation's guard has to be `isSuccess && !problem`,
    // not `isSuccess` alone, or a local refusal after a real success shows the
    // green «گذرواژهٔ شما عوض شد» and the red complaint together, which is a
    // lie about which of the two things actually happened last.
    const seen = stubServer()
    mountProfile()
    await fill(OLD, NEW, NEW)
    await submit()
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    // Fields are emptied on success, so leaving `current` blank here trips the
    // local refusal without a second request going out.
    await fill('', NEW, NEW)
    await submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('گذرواژهٔ فعلی خود را بنویسید')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText(/گذرواژهٔ شما عوض شد/)).toBeNull()
    expect(seen.writes).toHaveLength(1)
  })

  it('says nothing about success before anything has been submitted', async () => {
    // Otherwise the test above passes against a screen with the confirmation
    // permanently in its markup — which would tell somebody their password had
    // changed the moment they opened the page.
    stubServer()
    mountProfile()
    await screen.findByLabelText(CURRENT)
    expect(screen.queryByText(/گذرواژهٔ شما عوض شد/)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('empties all three fields afterwards', async () => {
    stubServer()
    mountProfile()
    await fill(OLD, NEW, NEW)
    await submit()
    await waitFor(() => expect(screen.getByLabelText(CURRENT)).toHaveValue(''))
    expect(screen.getByLabelText(NEXT)).toHaveValue('')
    expect(screen.getByLabelText(REPEAT)).toHaveValue('')
  })

  it('keeps this device signed in — it does not sign itself out on success', async () => {
    // The server keeps the calling session and revokes the rest
    // (`apply_password_change(keep_session=…)`). A screen that logged out here
    // would make the one thing it promised to leave alone the thing it broke.
    const seen = stubServer()
    mountProfile()
    await fill(OLD, NEW, NEW)
    await submit()
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    expect(seen.writes.map((w) => w.path)).toEqual(['/api/auth/password'])
  })

  it('does not send a second request while the first is in flight', async () => {
    // Two hashes queued on a limiter of two, and the second one carries a
    // `current` that the first request has already invalidated — so the
    // duplicate comes back «گذرواژهٔ فعلی درست نیست» on a change that worked.
    const seen = stubServer({ hang: true })
    mountProfile()
    await fill(OLD, NEW, NEW)
    await submit()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    // The same DOM node, found by whichever label it is wearing: while the
    // request is in flight the button's accessible name is its `loadingLabel`,
    // so a second `getByRole(…, { name: SUBMIT })` would fail to find it and
    // "no second request" would pass for the wrong reason.
    const button = screen.getByRole('button', { name: new RegExp(`در حال ثبت|${SUBMIT}`) })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(seen.writes).toHaveLength(1)
    seen.release()
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
  })

  it('clears the previous complaint when a second attempt succeeds', async () => {
    // A refusal left over from the last try sits under the one now in flight
    // and reads as a fresh rejection of a value that was fine.
    const bodies: unknown[] = []
    let status = 400
    vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      if (status >= 400) { status = 204; return json({ detail: 'گذرواژهٔ فعلی درست نیست' }, 400) }
      return new Response(null, { status: 204 })
    }))
    mountProfile()
    await fill(OLD, NEW, NEW)
    await submit()
    await screen.findByRole('alert')
    // A failed attempt does NOT clear the fields (only a successful one does),
    // so retyping without clearing first would make `userEvent.type` append
    // onto what is already there — sending a doubled `current` the real
    // server 400s, which is not the "second attempt" this test claims to be.
    // See the sibling test below, which clears the one field it re-types.
    await userEvent.clear(screen.getByLabelText(CURRENT))
    await userEvent.clear(screen.getByLabelText(NEXT))
    await userEvent.clear(screen.getByLabelText(REPEAT))
    await fill(OLD, NEW, NEW)
    await submit()
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    expect(screen.queryByRole('alert')).toBeNull()
    expect(bodies[1]).toEqual({ current: OLD, next: NEW })
  })

  it('clears a client-side complaint once the input it was about is corrected', async () => {
    const seen = stubServer()
    mountProfile()
    await fill(OLD, NEW, 'newpass-zzy')
    await submit()
    await screen.findByRole('alert')
    await userEvent.clear(screen.getByLabelText(REPEAT))
    await userEvent.type(screen.getByLabelText(REPEAT), NEW)
    await submit()
    await waitFor(() => expect(seen.writes).toHaveLength(1))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('what the profile screen says about itself', () => {
  it('states that only the account holder can change this password', async () => {
    // D13 refuses every self-edit, and the user-administration screens say so
    // in as many words. This screen is the single exception.
    //
    // The pre-rebuild copy framed this as a meta-sentence about the screen
    // itself ("فقط از همین صفحه … عوض می‌کنید") — the class of self-referential
    // "why there is no edit control here" prose R5 puts out of the app, and
    // §6.13's identity card (the one Task 22 replaced with the name/role
    // header) never carried it either. What survives, in the closing rule
    // statement under the form, is the fact that matters: nobody else can see
    // or set this value.
    stubServer()
    mountProfile()
    expect(await screen.findByText(/فقط خودتان می‌توانید تغییر دهید/)).toBeInTheDocument()
  })

  it('says the other devices were signed out AFTER it is changed, and not before', async () => {
    // **Owner ruling — the amber warning is gone.** *"in profile page, i want to
    // delete text «با عوض شدن گذرواژه…»"*.
    //
    // It was argued for on the grounds that a security action whose effects are
    // invisible is one people avoid, and that said only in the confirmation it
    // is news rather than a warning. The owner has read both sentences on the
    // screen and decided one of them is enough — which is the half that fires
    // when something actually happened. The success line below is asserted in
    // `Profile.test.tsx`'s own change-password block; here the point is that
    // NOTHING says it up front any more.
    stubServer()
    mountProfile()
    await screen.findByText(/فقط خودتان می‌توانید تغییر دهید/)
    expect(screen.queryByText(/دستگاه‌های دیگری که با این حساب وارد شده‌اند بیرون می‌آیند/))
      .toBeNull()
    expect(screen.queryByRole('note', { name: 'هشدار' })).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('names the account being changed', async () => {
    stubServer()
    mountProfile()
    expect(await screen.findByText('سحر بیات')).toBeInTheDocument()
    expect(screen.getByText('09121111111')).toBeInTheDocument()
  })

  it('names the role in Persian, on the one screen every account reaches', async () => {
    // **The sharpest instance of the raw identifier.** A `reader_no_download`
    // is a floor staffer who may read and take nothing away — the least
    // technical account in the installation — and this page, which every
    // account reaches and which is otherwise entirely Persian, printed that
    // string beside their own name.
    session = { ...READER, role: 'reader_no_download' }
    stubServer()
    mountProfile()
    expect(await screen.findByText('خواننده بدون خروجی')).toBeInTheDocument()
    expect(screen.queryByText('reader_no_download')).toBeNull()
  })

  it('leaves a role it has no wording for legible rather than blanking it', async () => {
    // The other half. Roles are seeded and written nowhere (D50), so a name that
    // is not in the map is one the server has ahead of this build — and «—», or
    // an empty span, would say this account has no role at all. A mutant that
    // returns the placeholder for anything unknown passes the test above.
    session = { ...READER, role: 'auditor' }
    stubServer()
    mountProfile()
    expect(await screen.findByText('auditor')).toBeInTheDocument()
  })

  it('pins the account number ltr inside the RTL prose beside the name', async () => {
    // A latin-digit run inside RTL prose, declared as an island in
    // `test/guards.test.ts`'s ISLANDS list precisely because `src/screens/`
    // sits in PENDING_REBUILD and so is not scanned for a bare `dir=` at all
    // — the declaration itself is unkillable there, and until now nothing
    // asserted the attribute it declares either.
    stubServer()
    mountProfile()
    expect(await screen.findByText('09121111111')).toHaveAttribute('dir', 'ltr')
  })
})

describe('who the profile screen is drawn for', () => {
  it('draws nothing and asks nothing before the session has arrived', async () => {
    // The screen lives under RequireAuth, so in the app this window is empty —
    // but a form rendered against `undefined` would be a form whose submit had
    // no account behind it, and «who am I» is the one thing this screen must
    // not guess.
    session = undefined
    const seen = stubServer()
    mountProfile()
    expect(screen.queryByLabelText(CURRENT)).toBeNull()
    expect(screen.queryByRole('button', { name: SUBMIT })).toBeNull()
    await waitFor(() => expect(seen.writes).toEqual([]))
  })

  it('is drawn for a Reader, who is refused every other administration surface', async () => {
    // The user screens answer this session 404 (`administrationRefusal`). This
    // one is ungated on purpose: everybody has a password.
    stubServer()
    mountProfile()
    expect(await screen.findByLabelText(CURRENT)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: SUBMIT })).toBeInTheDocument()
  })
})

describe('the way to the profile screen', () => {
  function renderShell(shell: 'panel' | 'reader', capabilities: Capability[]) {
    vi.stubGlobal('fetch', vi.fn(async () => json([])))
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const s = { ...READER, capabilities, scopes: ['dept:cooking'] }
    // Both shells start on their home screen: §6.0 draws the panel's top bar
    // there and the crumb strip everywhere else, and the entry this block is
    // about now lives in the top bar's «مدیریت» popover. At the router's default
    // `/` there is no popover to open and the assertion below would be about
    // nothing. The same is true of the reader as of Task 13 — its own top bar is
    // drawn on its root and a BACK BAR on every other screen, and «پروفایل من» is on
    // the top bar, so at `/` the reader's link would be missing for the same
    // reason rather than for the one this test is looking for.
    const entry = '/departments'
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route element={shell === 'panel' ? <PanelShell session={s} /> : <ReaderShell session={s} />}>
              <Route path={entry} element={<p>محتوا</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('is in the panel header, for a panel user who administers nobody', async () => {
    // Ungated, unlike the «کاربران» entry beside it: an Editor without
    // `manage_users` is answered 404 there and still has a password here — so
    // this is the one row that is in the popover for EVERY panel session, and
    // the «کاربران» row above it is absent for this one.
    renderShell('panel', ['view', 'comment', 'edit'])
    await userEvent.click(screen.getByRole('button', { name: /مدیریت/ }))
    expect(screen.getByRole('menuitem', { name: /^پروفایل و گذرواژه/ }))
      .toHaveAttribute('href', '/profile')
    expect(screen.queryByRole('menuitem', { name: /^کاربران/ })).toBeNull()
  })

  it('is in the reader header too', async () => {
    // The reader shell is where most of the staff live, and it is the shell
    // that has no administration surface at all — so a link only in the panel
    // header leaves the majority with no way to change their password.
    //
    // `findBy`, because the reader's chrome on this route waits for
    // `GET /api/departments`: R4 makes the shape of that answer decide which bar
    // is drawn, and drawing one and swapping it is the flicker R4 exists to
    // prevent.
    renderShell('reader', ['view', 'comment', 'export_pdf'])
    // R22 — the control's name is the deliverable's «پروفایل من» (reader 148)
    // rather than the plan's «نمایه», and is the same word `readerHere` gives
    // the screen it opens, so the two stop disagreeing about one page.
    expect(await screen.findByRole('link', { name: 'پروفایل من' })).toHaveAttribute('href', '/profile')
  })
})

describe('the profile header (§6.13)', () => {
  it('is titled with the person, not with the route', async () => {
    drawProfile(EDITOR)
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('ویدا مهرآیین')
    expect(screen.queryByRole('heading', { name: 'نمایه' })).toBeNull()
    const meta = screen.getByTestId('profile-meta')
    expect(meta).toHaveTextContent('ادیتور')
    // The number is a latin-digit run on a violet field: mono, pinned ltr.
    const number = within(meta).getByText(EDITOR.username)
    expect(number).toHaveAttribute('dir', 'ltr')
    expect(number).toHaveClass('font-mono')
  })

  it('pairs the new password with its repeat, and leads with violet labels', async () => {
    drawProfile(EDITOR)
    const card = await screen.findByRole('group', { name: 'تغییر گذرواژه' })
    const pair = within(card).getByTestId('password-pair')
    expect(pair).toHaveClass('grid', 'grid-cols-2', 'max760:grid-cols-1')
    expect(within(pair).getByLabelText('گذرواژهٔ تازه')).toBeInTheDocument()
    expect(within(pair).getByLabelText('تکرار گذرواژهٔ تازه')).toBeInTheDocument()
    // The current password is full width, above the pair.
    expect(within(pair).queryByLabelText('گذرواژهٔ فعلی')).toBeNull()
    // §5.2 TextField — the field label is the design's second label register:
    // 12.5px/600 `#4A25A9`, not the 11px/700 muted section caption.
    const label = within(card).getByText('گذرواژهٔ فعلی')
    expect(label).toHaveClass('text-fs-sm2', 'font-semibold', 'text-violet')
    expect(label).not.toHaveClass('font-bold', 'text-muted')
    expect(within(card).getByRole('button', { name: 'ذخیرهٔ گذرواژه' })).toBeInTheDocument()
  })

  it('draws one closing paragraph under the form, not three', async () => {
    // F47 counted three consecutive 12.5px paragraphs — grey, amber and lilac at
    // 6px separation — and gave the amber one a surface, because it was the only
    // consequential sentence and visually the second weakest. The owner has
    // since deleted that sentence outright, which answers F47 the shorter way:
    // there is no stack of three to rank any more.
    drawProfile(EDITOR)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByRole('note', { name: 'هشدار' })).toBeNull()
    expect(document.querySelectorAll('form ~ p, form p').length).toBeLessThan(3)
  })

  it('takes the ledger-corrected 22px title role and the sub-panel card recipe', async () => {
    // Two facts a `toHaveClass` check can pin even though jsdom computes no
    // pixel: which ROLE the title takes (ledger L-02/L-33 corrects the
    // brief's own 21px `text-fs-stat-sm` — see Profile.tsx's docstring on the
    // `<h1>`), and which recipe the password card's shell takes (the tinted
    // sub-panel `SectionCard.tsx` draws, reproduced locally per the docstring
    // on that `<div>` — radius 16, `--border-current`, `--surface-sub`).
    drawProfile(EDITOR)
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(h1).toHaveClass('text-fs-h2')
    expect(h1).not.toHaveClass('text-fs-stat-sm')
    const card = screen.getByRole('group', { name: 'تغییر گذرواژه' })
    expect(card).toHaveClass('rounded-card', 'bg-surface-sub', 'border-border-current')
  })

  it('sits the password trio on the sub-panel ground, not the card default', async () => {
    // `PasswordFieldProps.ground`'s own docstring in `ui/src/ui/fieldFrame.ts`
    // names this exact trio as the reason the prop exists: left at the
    // default `'card'`, each field draws a near-white box on the card's own
    // `#FBF9FE` tint, indistinguishable but for a hairline.
    drawProfile(EDITOR)
    const current = await screen.findByLabelText('گذرواژهٔ فعلی')
    expect(current).toHaveClass('bg-surface-sub')
    expect(current).not.toHaveClass('bg-card')
    expect(screen.getByLabelText('گذرواژهٔ تازه')).toHaveClass('bg-surface-sub')
    expect(screen.getByLabelText('تکرار گذرواژهٔ تازه')).toHaveClass('bg-surface-sub')
  })
})
