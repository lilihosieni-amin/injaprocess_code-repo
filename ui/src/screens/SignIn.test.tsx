import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SignIn } from './SignIn'
import { createWrapper } from '../test/utils'

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
    expect(screen.getByRole('button')).toBeDisabled()
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
