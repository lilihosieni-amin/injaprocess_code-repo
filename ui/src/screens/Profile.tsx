import { useId, useState, type FormEvent } from 'react'
import { useSession } from '../auth/useSession'
import { useChangeOwnPassword } from '../api/hooks'
import { refusalText } from '../lib/refusal'
import { roleLabel } from '../lib/roles'
import { MIN_PASSWORD, TOO_SHORT } from '../lib/userDraft'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'

/** Said here rather than left to the server, because the server's answer to an
 *  empty `current` is «گذرواژهٔ فعلی درست نیست» — a sentence that blames a value
 *  the person never typed, and that costs a ~122 ms verify to produce. */
const NO_CURRENT = 'گذرواژهٔ فعلی خود را بنویسید.'
/** The one rule on this screen the server has no opinion about at all: it takes
 *  a single `next` and cannot know what was meant to be repeated. */
const MISMATCH = 'گذرواژهٔ تازه و تکرار آن یکی نیستند.'

/**
 * Your own account, and the one act you perform on it (D7, D15, D58).
 *
 * **This screen is the single exception to D13.** Nobody edits their own record
 * — the delegation rule refuses it, `mayManage` withholds every control on it,
 * and `UserDetail` says so in words and sends people here. What it sends them
 * here *for* is a password, and nothing else: this is deliberately not a second
 * route to self-modification, so there is no name, no number, no role, no scope
 * and no supervisor to change on it. Those are all read-only facts above the
 * form, and the only writable thing on the page is the password.
 *
 * **Ungated, and that is the difference from every other screen in this
 * sub-project.** `administrationRefusal` answers a department-scoped Reader 404
 * on the user surfaces; that same Reader has a password and reaches this. So
 * there is no capability check here and there is not going to be one — the
 * endpoint changes the row of whoever is calling it and can change nobody
 * else's, which is the whole of the authorisation.
 *
 * **`POST /api/auth/password`, not `POST /api/users/{id}/password`.** The two
 * look alike and are not: the second is an administrator setting somebody
 * else's value, takes no current password, and ends every session that account
 * holds. This one re-verifies the current password precisely because a session
 * left open on a shared back-office screen is what it exists to be able to end.
 *
 * **The three local refusals are `when`, not `what`.** The floor is the server's
 * (`auth.MIN_PASSWORD_LENGTH`, restated once in `lib/userDraft`), and the empty
 * current password is a request the server would refuse anyway — checked here so
 * that a value which cannot possibly be accepted does not first cost a verify
 * and a hash on the shared argon2 limiter. The repeat is the one rule that is
 * only ever local: the request carries a single `next`, so the server has no way
 * to know what was meant to be typed twice.
 */
export function Profile() {
  const currentId = useId()
  const nextId = useId()
  const repeatId = useId()
  const session = useSession().data
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const change = useChangeOwnPassword()

  // Hooks first, then the early return: an early return above them would change
  // hook order between renders the moment the descriptor lands.
  //
  // In the app this window is empty — `RequireAuth` has already resolved
  // `GET /api/auth/me` before any screen mounts — so drawing the blank costs no
  // flicker. It is here because a form rendered against no session is a form
  // whose submit has no account behind it, and «whose password is this» is the
  // one question this screen must never answer by guessing.
  if (!session) return <div className="flex-1 bg-bg" />

  function submit(e: FormEvent) {
    e.preventDefault()
    // Cleared on every attempt: a complaint left over from the last try sits
    // under the one now in flight and reads as a fresh rejection of a value
    // that was fine.
    //
    // Only the local one. `change.reset()` stood here too and was **dead** —
    // there is no input that makes it observable, which is how it was found:
    // `mutate` moves the mutation to `pending`, so the previous `error` and
    // `isSuccess` are gone the moment a request goes out, and on the paths
    // where no request goes out `problem` is set and takes precedence over
    // both (the alert reads `problem ?? …`, the confirmation is gated on
    // `!problem`). A line that no test can be written against is not a
    // safeguard; it is something for a later reader to preserve for a reason
    // that was never true.
    setProblem(null)
    if (current === '') { setProblem(NO_CURRENT); return }
    // Length before the repeat, so that two identical short values are told the
    // thing that is actually wrong with them.
    if (next.length < MIN_PASSWORD) { setProblem(TOO_SHORT); return }
    if (next !== repeat) { setProblem(MISMATCH); return }
    change.mutate({ current, next }, {
      onSuccess: () => {
        // All three, and only on success: a failed attempt keeps what was typed
        // so the person can correct the one field the server named rather than
        // start again.
        setCurrent('')
        setNext('')
        setRepeat('')
      },
    })
  }

  return (
    <div className="flex-1 overflow-auto py-s12 px-s12">
      <div className="max-w-list mx-auto">
        <h1 className="text-title font-extrabold text-ink">نمایه</h1>

        <Card className="px-s9 py-s8 mt-s8 flex flex-col gap-s4">
          <span className="text-subtitle font-bold text-ink">{session.displayName}</span>
          <div className="flex items-center gap-s6 flex-wrap">
            {/* A latin-digit run inside RTL prose, pinned `ltr` so a stored
                spelling that is not digits alone stays in the order it was
                stored in. Declared in `test/guards.test.ts`'s ISLANDS. */}
            <span dir="ltr" className="text-caption text-muted font-mono">{session.username}</span>
            {/* **The sharpest instance of the raw identifier.** Every account
                reaches this page, including a floor staffer with no English at
                all, and `reader_no_download` beside their own name was the only
                latin text on it besides their number. */}
            <span className="text-caption text-violet font-bold">{roleLabel(session.role)}</span>
          </div>
          {/* Read-only, every one of them, and the paragraph says why rather
              than leaving somebody hunting for an edit control that D13 will
              never put here. */}
          <p className="text-caption text-faint m-0">
            نام، شماره، نقش و دامنهٔ دسترسی حساب خودتان را از اینجا نمی‌توانید عوض
            کنید؛ اینها را مدیر سامانه تغییر می‌دهد.
          </p>
        </Card>

        <Card className="px-s9 py-s8 mt-s8">
          <h2 className="text-subtitle font-bold text-ink">تغییر گذرواژه</h2>
          <p className="text-caption text-muted mt-s3">
            گذرواژهٔ خودتان را فقط از همین صفحه و فقط خودتان عوض می‌کنید؛ حساب
            خودتان را از صفحهٔ کاربران نمی‌توانید تغییر دهید.
          </p>
          {/* Said before the change, not after it: a security action whose
              effects are invisible is one people avoid, and «your other devices
              were signed out» in the confirmation is news rather than a warning
              — about a tablet in the kitchen somebody else is holding. */}
          <p className="text-caption text-warn font-bold mt-s3">
            با عوض شدن گذرواژه، همهٔ دستگاه‌های دیگری که با این حساب وارد شده‌اند
            بیرون می‌آیند؛ همین دستگاه باز می‌ماند.
          </p>
          <p className="text-caption text-faint mt-s3">
            اگر گذرواژه‌تان را فراموش کردید، مدیر سامانه گذرواژهٔ تازه‌ای برایتان
            می‌گذارد؛ پیوند بازیابی در کار نیست.
          </p>

          <form onSubmit={submit} className="flex flex-col gap-s6 mt-s7">
            <Field id={currentId} label="گذرواژهٔ فعلی" autoComplete="current-password"
              value={current} onChange={setCurrent} />
            <Field id={nextId} label="گذرواژهٔ تازه" autoComplete="new-password"
              value={next} onChange={setNext} />
            <Field id={repeatId} label="تکرار گذرواژهٔ تازه" autoComplete="new-password"
              value={repeat} onChange={setRepeat} />

            <div>
              {/* `Button`'s BASE carries no horizontal padding and no type size
                  on purpose (I5) — the call site owns both — so a bare
                  `<Button>` is a 44 px box with its text against the edges, at
                  inherited body size. jsdom measures nothing, so only a browser
                  ever shows it. `loading` also forces `disabled`, which is what
                  stops a second submit landing behind the first: the duplicate
                  would carry a `current` the first request has already
                  invalidated, and come back «گذرواژهٔ فعلی درست نیست» on a
                  change that worked. */}
              <Button type="submit" variant="violet" className="px-s8 text-caption"
                loading={change.isPending} loadingLabel="در حال ثبت…">
                تغییر گذرواژه
              </Button>
            </div>
          </form>

          {(problem || change.error) && (
            // role="alert": this text appears after the press that caused it, so
            // a screen reader is elsewhere on the page when it arrives and would
            // otherwise never be told.
            //
            // `refusalText` echoes the SERVER's sentence for a 4xx that carries
            // one, because both of this endpoint's refusals name which of the
            // two fields to correct — «گذرواژهٔ فعلی درست نیست» is not
            // «گذرواژه باید دست‌کم ۶ نویسه باشد», and «انجام نشد» in their place
            // leaves somebody retyping the wrong field. A 5xx and a 4xx with no
            // sentence get the local retry line instead.
            <p role="alert" className="text-caption text-conflict mt-s5">
              {problem ?? refusalText(change.error)}
            </p>
          )}
          {change.isSuccess && !problem && (
            <p role="status" className="text-caption text-green font-bold mt-s5">
              گذرواژهٔ شما عوض شد. دستگاه‌های دیگر از این حساب بیرون آمدند؛ همین
              دستگاه باز است.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}

/**
 * One password field.
 *
 * `type="password"` lives here, once, rather than at three call sites: this is a
 * shared back-office screen, a field that renders as `type="text"` puts somebody's
 * password on it in front of whoever is standing there, and **no test that reads
 * a field by its label can see the difference** — an earlier screen in this
 * project shipped exactly that and passed every assertion in its file.
 *
 * No `maxLength`, deliberately. A cap does not reject a longer password, it
 * silently stores a *different* one — and jsdom does not enforce `maxLength` at
 * all, so a browser would truncate where every runnable test stayed green.
 */
function Field({ id, label, autoComplete, value, onChange }: {
  id: string
  label: string
  autoComplete: 'current-password' | 'new-password'
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-s2">
      <label htmlFor={id} className="text-caption font-bold text-muted">{label}</label>
      <input
        id={id}
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-touch px-s7 rounded-control border border-line bg-card text-body text-ink"
      />
    </div>
  )
}
