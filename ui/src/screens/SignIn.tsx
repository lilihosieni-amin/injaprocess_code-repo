import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { normalisePhone } from '../lib/digits'
import { useLogin } from '../api/hooks'

const MIN_PASSWORD = 6

export function SignIn() {
  const numberId = useId()
  const passwordId = useId()
  const [number, setNumber] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const login = useLogin()
  const navigate = useNavigate()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD) {
      setError(`گذرواژه باید دست‌کم ${MIN_PASSWORD} نویسه باشد.`)
      return
    }
    try {
      await login.mutateAsync({ username: normalisePhone(number), password })
      navigate('/departments', { replace: true })
    } catch {
      // One message for every refusal. The server deliberately does not tell
      // wrong-password from unknown-number apart, and copy that guessed would
      // undo that.
      setError('شماره یا گذرواژه درست نیست.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-login-bg p-6">
      <Card className="w-full max-w-list p-8">
        <h1 className="text-title font-extrabold text-ink m-0">ورود به سامانه</h1>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor={numberId} className="text-caption font-bold text-muted">
              شمارهٔ موبایل
            </label>
            <input
              id={numberId}
              type="tel"
              inputMode="numeric"
              dir="ltr"
              // No maxLength. normalisePhone accepts nine spellings — five of
              // them, including '+98 0912 345 6789' and '(0912) 3456789', are
              // longer than a canonical number. Truncating one does not reject
              // it, it silently makes a DIFFERENT number, and D56's identical
              // 401 then tells the person only that something was wrong while
              // they look at a correctly-typed phone. USERNAME_RE is what says
              // no, after normalisation, where the answer can be honest.
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="min-h-touch px-4 rounded-control border border-line bg-card text-body text-ink"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor={passwordId} className="text-caption font-bold text-muted">
              گذرواژه
            </label>
            <input
              id={passwordId}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-touch px-4 rounded-control border border-line bg-card text-body text-ink"
            />
          </div>

          {error && (
            <p role="alert" className="text-body text-conflict m-0">{error}</p>
          )}

          <Button type="submit" variant="violet" className="px-4"
                  loading={login.isPending} loadingLabel="در حال ورود…">
            ورود
          </Button>
        </form>
      </Card>
    </div>
  )
}
