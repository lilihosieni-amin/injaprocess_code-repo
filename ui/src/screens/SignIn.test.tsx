import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SignIn } from './SignIn'
import { createWrapper } from '../test/utils'
import { FIELD_LABEL } from '../ui/fieldFrame'

afterEach(() => vi.restoreAllMocks())

// Typed as `fetch` itself so `spy.mock.calls[0][1]` is the RequestInit the code
// under test passed; an untyped vi.fn() has an empty argument tuple and `tsc -b`
// rejects the index.
function mockFetch(status: number, body: unknown = {}) {
  const spy = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  }))
  vi.stubGlobal('fetch', spy)
  return spy
}

describe('SignIn', () => {
  it('labels the number field and marks it as a phone number', () => {
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    const field = screen.getByLabelText('شمارهٔ موبایل')
    expect(field).toHaveAttribute('type', 'tel')
    expect(field).toHaveAttribute('inputMode', 'numeric')
    expect(field).toHaveAttribute('dir', 'ltr')
    expect(field).toHaveAttribute('autoComplete', 'username')
  })

  it('runs the number left-to-right without setting it in the mono face', () => {
    // §8's `ltr` prop on TextField means "a latin island": it pins the
    // direction AND swaps to --font-mono. This field is the first case that is
    // one without the other. The DS Login's own Input writes
    // `fontFamily: var(--font-sans)`, and the placeholder here is «۰۹۱۲۳۴۵۶۷۸۹»
    // — Persian digits, which the mono stack (SF Mono, Menlo, Consolas) has no
    // glyphs for and would render from a fallback face at a different size.
    // Asserted as the absence of a class, which is the only form jsdom can
    // carry: `font-mono` written here is a string that would reach the
    // stylesheet, and its absence is the claim being made.
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    const field = screen.getByLabelText('شمارهٔ موبایل')
    expect(field).toHaveAttribute('dir', 'ltr')
    expect(field.className).not.toContain('font-mono')
  })

  it('masks the password', () => {
    // type="text" here puts someone's password on screen in a shared kitchen,
    // and nothing else in the suite would notice: every other assertion in this
    // file reads the field by its label, which works the same either way.
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    const field = screen.getByLabelText('گذرواژه')
    expect(field).toHaveAttribute('type', 'password')
    expect(field).toHaveAttribute('autoComplete', 'current-password')
  })

  it('runs the password left-to-right too — owner ruling', async () => {
    // *"In the login page, the password input should also be left-to-right
    // (LTR), just like the mobile number field."* `PasswordField` pins it on
    // its own input with no prop, because a password is a latin token in every
    // one of the four boxes this product draws — never Persian prose — and in a
    // right-to-left box the caret starts on the wrong side and the bullets grow
    // the wrong way.
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    expect(screen.getByLabelText('گذرواژه')).toHaveAttribute('dir', 'ltr')
    // …and it is NOT set in the mono face. §8's rule for a latin island is the
    // direction and the face together; only the first half is about a value
    // nobody reads back, which is what a row of bullets is.
    expect(screen.getByLabelText('گذرواژه')).not.toHaveClass('font-mono')
  })

  it('moves to the password the moment the number is complete', async () => {
    // *"when the user fully enters their mobile number, it should automatically
    // move focus to the password input."*
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    const number = screen.getByLabelText('شمارهٔ موبایل')
    await userEvent.click(number)
    await userEvent.type(number, '0912345678')
    expect(number).toHaveFocus()          // ten digits: not a number yet
    await userEvent.type(number, '9')
    expect(screen.getByLabelText('گذرواژه')).toHaveFocus()
  })

  it('advances on any spelling sign-in itself accepts, not just on 09…', async () => {
    // `normalisePhone` takes nine spellings and the form accepts all of them, so
    // a hand-off keyed on the raw string would advance for one person and not
    // for the next.
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    const number = screen.getByLabelText('شمارهٔ موبایل')
    await userEvent.click(number)
    await userEvent.type(number, '+989123456789')
    expect(screen.getByLabelText('گذرواژه')).toHaveFocus()
  })

  it('does not snatch the caret back while a complete number is being corrected', async () => {
    // The transition, not the state. Editing a digit in the middle of a
    // complete number leaves it complete, so a check on "is it valid now"
    // would fire on every keystroke of the correction and throw the caret out
    // of the field being corrected.
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    const number = screen.getByLabelText('شمارهٔ موبایل')
    await userEvent.click(number)
    await userEvent.type(number, '09123456789')
    await userEvent.click(number)
    await userEvent.type(number, '0')          // twelve digits — no longer valid
    await userEvent.keyboard('{Backspace}')    // …and valid again
    expect(number).toHaveFocus()
  })

  it('refuses a malformed number locally, and says so', async () => {
    // The one thing the server cannot tell you. Under D56 its refusal is
    // deliberately identical for an unknown number and a wrong password, so
    // "your number is not a number" has to be said here or not at all.
    const spy = mockFetch(200, {})
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '0912')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('شمارهٔ موبایل معتبر نیست.')
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not blame the credentials when the server fails', async () => {
    // A 500 is not a refusal. Reporting it as one sends a person off to reset a
    // password that was always correct, during an outage. D56 governs 401.
    mockFetch(500, { detail: 'boom' })
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }))
    const alert = await screen.findByRole('alert')
    expect(alert).not.toHaveTextContent('گذرواژه درست نیست')
    expect(alert).toHaveTextContent('ارتباط با سامانه برقرار نشد. دوباره تلاش کنید.')
  })

  it('sends the number in canonical form however it was typed', async () => {
    const spy = mockFetch(200, { username: '09123456789' })
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '۰۹۱۲۳۴۵۶۷۸۹')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }))
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.username).toBe('09123456789')
  })

  // The three cases below are not in the task brief. They close mutants the
  // brief's five leave alive: the endpoint URL (whose only assertion used to
  // live in the Login block this screen replaces), a country-code spelling
  // against the field's own maxLength, and the hand-off after success.

  it('posts to the sign-in endpoint', async () => {
    const spy = mockFetch(200, { username: '09123456789' })
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }))
    expect(spy.mock.calls[0][0]).toBe('/api/auth/login')
    expect((spy.mock.calls[0][1] as RequestInit).method).toBe('POST')
  })

  it('sends the number in canonical form when it carries a country code', async () => {
    // Also guards the field's maxLength: a limit too tight to hold "+98…" would
    // truncate the number before normalisePhone ever saw the last digit.
    const spy = mockFetch(200, { username: '09123456789' })
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '+989123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }))
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.username).toBe('09123456789')
    expect(body.password).toBe('sixchars')
  })

  it('hands off to the app once the credentials are accepted', async () => {
    mockFetch(200, { username: '09123456789' })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<SignIn />} />
            <Route path="/departments" element={<div>دپارتمان‌ها</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }))
    expect(await screen.findByText('دپارتمان‌ها')).toBeInTheDocument()
    expect(screen.queryByLabelText('شمارهٔ موبایل')).not.toBeInTheDocument()
  })

  it('shows one message for every kind of refusal', async () => {
    mockFetch(401, { detail: 'authentication required' })
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }))
    // The screen must not distinguish wrong-password from unknown-number: the
    // server deliberately does not, and copy that guessed would undo it.
    const msg = await screen.findByRole('alert')
    expect(msg.textContent).toMatch(/شماره یا گذرواژه/)
    expect(msg.textContent).not.toMatch(/وجود ندارد|غیرفعال|نادرست است/)
  })

  it('says the same words whether or not the number belongs to an account', async () => {
    // D56's guarantee is not "the copy avoids certain words", it is that the two
    // cases are INDISTINGUISHABLE. The test above it reads one 401 and checks
    // the sentence against a blocklist, which a screen that branched on the
    // server's `detail` would walk straight past — «این شماره ثبت نشده» carries
    // no word of that list and tells an attacker which numbers are accounts.
    //
    // So both cases are rendered and their text compared to each other. The
    // server sends one body for both; a screen that reads it at all fails here.
    const say = async (detail: string) => {
      mockFetch(401, { detail })
      const Wrapper = createWrapper()
      const { unmount } = render(<Wrapper><SignIn /></Wrapper>)
      await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
      await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
      await userEvent.click(screen.getByRole('button', { name: 'ورود' }))
      const text = (await screen.findByRole('alert')).textContent
      unmount()
      vi.unstubAllGlobals()
      return text
    }
    const unknownNumber = await say('no such user')
    const wrongPassword = await say('bad password')
    expect(unknownNumber).toBe(wrongPassword)
    expect(unknownNumber).toBe('شماره یا گذرواژه درست نیست.')
  })

  it('refuses to submit a password under six characters without calling the API', async () => {
    const spy = mockFetch(200)
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'five5')
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }))
    expect(spy).not.toHaveBeenCalled()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('clears the previous message when the person tries again', async () => {
    // Mutant this kills: dropping `setError(null)` at the top of the submit
    // handler leaves a refusal from the last attempt on screen underneath the
    // one now in flight, which reads as a fresh rejection of a correct password.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})))
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'five5')
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('گذرواژه'), 'more')
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('disables the button while the request is in flight', async () => {
    let release: (v: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { release = r })))
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    await userEvent.type(screen.getByLabelText('شمارهٔ موبایل'), '09123456789')
    await userEvent.type(screen.getByLabelText('گذرواژه'), 'sixchars')
    await userEvent.click(screen.getByRole('button', { name: 'ورود' }))
    // Named, because the password field now carries its own reveal toggle and a
    // bare getByRole('button') would find two.
    //
    // Named by the LOADING label and not by «ورود»: Button swaps its children
    // for `loadingLabel` while a request is in flight, so the accessible name
    // of the control this test is about is «در حال ورود…» for exactly as long
    // as the state it asserts lasts. Asking for «ورود» finds nothing — which is
    // also the only assertion in the suite that would notice `loadingLabel`
    // being dropped, leaving a button that goes silently dead under the cursor.
    expect(screen.getByRole('button', { name: 'در حال ورود…' })).toBeDisabled()
    release(new Response('{}', { status: 200 }))
  })

  it('does not cap the number field short enough to mangle a valid spelling', () => {
    // Asserted on the attribute, not on typing, because jsdom does not enforce
    // maxLength at all — a browser would truncate where every test we can run
    // stays green. And truncation here does not reject the input, it quietly
    // makes a different phone number: '+98 0912 345 6789' is 18 characters, and
    // a cap of 13 turns it into an account nobody owns. D56 then answers with
    // the same 401 it gives a wrong password, so the person is told nothing
    // while looking at a number they typed correctly.
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    const field = screen.getByLabelText('شمارهٔ موبایل')
    const cap = field.getAttribute('maxLength')
    expect(cap === null || Number(cap) >= 18).toBe(true)
  })
})

describe('the brand lockup the design specifies and the app has never drawn', () => {
  it('draws the one raster the product ships', () => {
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    const logo = screen.getByRole('img', { name: 'اینجا فست‌فود' })
    expect(logo).toHaveAttribute('src')
    expect(logo.className).toContain('w-logo-login')     // --size-logo-login: 76px
    expect(logo.className).toContain('rounded-feature')  // 20px
    expect(logo.className).toContain('object-cover')
  })

  it('carries the two-line brand beneath it', () => {
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    expect(screen.getByText('اینجا فست‌فود')).toBeInTheDocument()
    expect(screen.getByText('سامانهٔ مستندسازی فرآیندها')).toBeInTheDocument()
  })

  it('is a dialog-scale panel, not a 920px list', () => {
    // O10 — `max-w-list` is --width-list, 920px: a login card almost a metre
    // wide on a desktop monitor, holding two inputs.
    const { container } = render(<>{createWrapper()({ children: <SignIn /> })}</>)
    const card = container.querySelector('form')!
    expect(card.className).toContain('w-login')          // 380px
    expect(card.className).toContain('rounded-panel')    // 24px
    expect(card.className).not.toContain('max-w-list')
  })

  it('stands on the login field, with the two orbs the design puts behind it', () => {
    // Added after a mutation run, not before it: deleting both orbs, and
    // repainting `--login-bg` as `--ink`, each survived every other assertion
    // in this file. Both are read by `e2e/sign-in.spec.ts` — which measures the
    // painted colour and the drawn circle, and is the only check that can —
    // but a browser check nothing runs in CI's unit lane is not cover for a
    // whole screen going the wrong colour.
    //
    // What this claims is what jsdom can carry: the strings are written, on the
    // right elements, and the orbs are hidden from the accessibility tree
    // because they are decoration. Whether either paints a pixel is the
    // browser's answer, not this one's.
    const { container } = render(<>{createWrapper()({ children: <SignIn /> })}</>)
    const wrap = container.querySelector('[data-screen="signIn"]')!
    expect(wrap.className).toContain('bg-login-bg')
    expect(wrap.className).toContain('relative')      // the orbs are absolute against it
    expect(wrap.className).toContain('overflow-hidden')
    const orbs = container.querySelectorAll('.login-orb-a, .login-orb-b')
    expect(orbs).toHaveLength(2)
    orbs.forEach((o) => expect(o).toHaveAttribute('aria-hidden'))
  })

  it('sets the two fields apart by the design\'s own 16px', () => {
    // Not in the task brief, and the brief's JSX is wrong without it. The DS
    // Login gives every `Input` `marginBottom: 16`; the brief replaces those
    // inputs with `TextField`/`PasswordField` inside a `<form>` that sets no
    // gap, which leaves the number box and the password box sharing an edge —
    // one 1.5px line between two controls, read as a single divided control.
    //
    // The class lands on the field WRAPPER (TextField's own root div), which is
    // why it is asserted on the input's parent chain rather than on the input:
    // `mb-s8` on the <input> itself would be inside the border and would move
    // nothing. jsdom carries no layout, so this asserts the class string only;
    // the 16px it resolves to is `--space-8`, and what a browser makes of it is
    // the screenshot's business.
    const Wrapper = createWrapper()
    const { container } = render(<Wrapper><SignIn /></Wrapper>)
    const form = container.querySelector('form')!
    const number = screen.getByLabelText('شمارهٔ موبایل')
    const password = screen.getByLabelText('گذرواژه')
    const fieldOf = (el: Element) => {
      let n: Element | null = el
      while (n && n.parentElement !== form) n = n.parentElement
      return n!
    }
    expect(fieldOf(number).className).toContain('mb-s8')
    expect(fieldOf(password).className).toContain('mb-s8')
  })

  it('takes its field label from the shared frame rather than dressing its own', () => {
    // This asserted `text-violet`, `font-semibold` and `text-fs-sm2` under the
    // title "gives its field labels the brand violet" — and graded
    // `fieldFrame.ts`'s `FIELD_LABEL` constant, which `TextField` and
    // `PasswordField` write unconditionally. It passed identically for every
    // screen in the app, including screens that do not exist, and it would have
    // gone on passing if SignIn had stopped rendering a field at all.
    //
    // What SignIn actually decides is whether its one field goes through the
    // primitive, and that is what this says: the label's class IS the shared
    // string, byte for byte. A screen that hand-rolls a label to look the same
    // fails here. The visual audit's finding 6 — that the DS Login's label is
    // 12.5px/600 --violet and not the muted section-caption register — is
    // graded against COMPILED CSS in `src/ui/fields.test.tsx`, once, where the
    // constant lives.
    const Wrapper = createWrapper()
    render(<Wrapper><SignIn /></Wrapper>)
    const label = screen.getByText('شمارهٔ موبایل')
    expect(label.tagName).toBe('LABEL')
    expect(label.className).toBe(FIELD_LABEL)
    // …and the constant is not empty, or the line above would pass against a
    // label with no class at all.
    expect(FIELD_LABEL).toContain('text-violet')
  })
})
