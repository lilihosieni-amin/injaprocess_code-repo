import { useId, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { TextField } from '../ui/TextField'
import { PasswordField } from '../ui/PasswordField'
import { normalisePhone } from '../lib/digits'
import { useLogin } from '../api/hooks'
import { ApiError } from '../api/client'
import injaLogo from '../assets/inja-logo.jpg'

const MIN_PASSWORD = 6
// The server's twin of this is phone.USERNAME_RE. Checked here as well because
// D56 makes the server's refusal deliberately uninformative: it cannot tell you
// your number was malformed without also telling an attacker which numbers
// exist. A local check leaks nothing — it never consults the account list — so
// it is the only place a person can be told the actual problem.
const CANONICAL_NUMBER = /^09\d{9}$/

export function SignIn() {
  const numberId = useId()
  const passwordId = useId()
  const [number, setNumber] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  /** Whether the caret has already been handed on. See `onNumber`. */
  const handedOn = useRef(false)
  const login = useLogin()
  const navigate = useNavigate()

  /**
   * **The number is finished, so the caret moves on** — owner ruling: *"when the
   * user fully enters their mobile number, it should automatically move focus to
   * the password input."*
   *
   * **Once per form, and that is the whole of the rule.** "Became complete" is
   * not a state anybody can be in twice on purpose: somebody who comes BACK to
   * correct a finished number passes through it on every keystroke — delete a
   * digit, type one, it is eleven again — and a hand-off keyed on the
   * transition alone would throw the caret out of the field they are fixing,
   * every time, while they are looking at it.
   *
   * Through `normalisePhone`, so «۰۹۱۲…» and «+98 912 …» advance exactly as
   * `09…` does — the same nine spellings sign-in itself accepts. Guarded on the
   * number field still being the focused element, so a paste from the browser's
   * own autofill, which fills both boxes and may leave the caret anywhere, does
   * not get taken over.
   */
  function onNumber(next: string) {
    setNumber(next)
    if (handedOn.current || !CANONICAL_NUMBER.test(normalisePhone(next))) return
    if (document.activeElement?.id !== numberId) return
    handedOn.current = true
    // By id, and not through a ref threaded into `PasswordField`: the id is
    // already the contract between that component's `<label htmlFor>` and its
    // input, so this is the association the browser itself uses and it costs
    // the shared field no new prop. `useId` produces `:r5:`-shaped strings,
    // which `getElementById` takes literally — it is not a selector.
    document.getElementById(passwordId)?.focus()
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const username = normalisePhone(number)
    if (!CANONICAL_NUMBER.test(username)) {
      setError('شمارهٔ موبایل معتبر نیست.')
      return
    }
    if (password.length < MIN_PASSWORD) {
      setError(`گذرواژه باید دست‌کم ${MIN_PASSWORD} نویسه باشد.`)
      return
    }
    try {
      await login.mutateAsync({ username, password })
      navigate('/departments', { replace: true })
    } catch (e) {
      // One message for every REFUSAL: the server deliberately does not tell
      // wrong-password from unknown-number apart, and copy that guessed would
      // undo that. But a 500 or a dropped connection is not a refusal, and
      // saying "your password is wrong" during an outage sends people to reset
      // a password that was always correct. D56 governs 401 and nothing else.
      const refused = e instanceof ApiError && e.status === 401
      setError(refused
        ? 'شماره یا گذرواژه درست نیست.'
        : 'ارتباط با سامانه برقرار نشد. دوباره تلاش کنید.')
    }
  }

  return (
    <div data-screen="signIn" className="min-h-screen relative flex items-center justify-center overflow-hidden bg-login-bg p-s10">
      <span aria-hidden className="login-orb-a" />
      <span aria-hidden className="login-orb-b" />

      <form onSubmit={onSubmit} className="relative w-login max-w-full bg-bg rounded-panel p-s12 shadow-modal">
        <div className="flex flex-col items-center gap-s7 mb-s10">
          <img src={injaLogo} alt="اینجا فست‌فود"
            className="w-logo-login h-logo-login rounded-feature object-cover" />
          <div className="text-center">
            <div className="font-extrabold text-fs-h3 text-ink">اینجا فست‌فود</div>
            <div className="text-fs-sm2 text-muted mt-s1">سامانهٔ مستندسازی فرآیندها</div>
          </div>
        </div>

        {/* `mb-s8` on each field, and it is the design's own number rather than a
            margin picked to taste: the DS Login gives every Input
            `marginBottom:16`, and the two fields are otherwise flush — two
            boxes sharing an edge, which reads as one control with a line
            through it. It also sets the distance to the submit exactly, since
            16 + the button's own `mt-s4` is the 24 the DS draws there. */}
        <TextField
          id={numberId}
          label="شمارهٔ موبایل"
          type="tel"
          inputMode="numeric"
          autoComplete="username"
          dir="ltr"
          placeholder="۰۹۱۲۳۴۵۶۷۸۹"
          // No maxLength. normalisePhone accepts nine spellings — five of them,
          // including '+98 0912 345 6789' and '(0912) 3456789', are longer than
          // a canonical number. Truncating one does not reject it, it silently
          // makes a DIFFERENT number, and D56's identical 401 then tells the
          // person only that something was wrong while they look at a
          // correctly-typed phone. USERNAME_RE is what says no, after
          // normalisation, where the answer can be honest.
          value={number}
          onChange={onNumber}
          className="mb-s8"
        />

        <PasswordField
          id={passwordId}
          label="گذرواژه"
          autoComplete="current-password"
          placeholder="گذرواژه را بنویسید"
          value={password}
          onChange={setPassword}
          className="mb-s8"
        />

        {error && <p role="alert" className="text-fs-sm2 text-conflict mt-s4 mb-s4">{error}</p>}

        <Button type="submit" variant="coral" block
          loading={login.isPending} loadingLabel="در حال ورود…"
          className="mt-s4 py-s7 px-s9 text-fs-body">
          ورود
        </Button>
      </form>
    </div>
  )
}
