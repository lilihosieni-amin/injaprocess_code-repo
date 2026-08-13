import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSession } from '../auth/useSession'
import { administrationRefusal } from '../auth/can'
import {
  mayManage, useSetUserDisabled, useSetUserPassword, useUser,
} from '../api/users'
import { ApiError, refusalStatus } from '../api/client'
import { jalali } from '../lib/format'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { StatusPill } from '../ui/StatusPill'
import { RefusalScreen } from './Refusal'
import { LoadFailedScreen, SUPERVISOR_GONE } from './Users'

/** The server's floor (`auth.MIN_PASSWORD_LENGTH`, D58). Restated here so a
 *  value that cannot possibly be accepted never costs the ~61 ms argon2 hash the
 *  endpoint spends before it can say so — the refusal is not re-decided, it is
 *  answered earlier. */
const MIN_PASSWORD = 6
const TOO_SHORT = 'گذرواژه باید دست‌کم ۶ نویسه باشد.'

/** Everything that is not the server's own considered refusal: a 5xx, a dropped
 *  connection, a body that would not parse. */
const FAILED = 'انجام نشد؛ دوباره تلاش کنید.'

/**
 * What a failed write says.
 *
 * **The server's own sentence, for every 4xx.** `routers/users.py` exists to
 * turn each of `delegation.py`'s error keys into a Persian sentence written for
 * whoever is holding this screen — «این تنها ویرایشگر فعال سامانه است…»,
 * «نمی‌توانید دسترسی‌ای بیشتر از دسترسی خودتان به کسی بدهید» — and each of them
 * names the thing to do next. Replacing them with one local «انجام نشد» throws
 * that away and leaves an administrator pressing the same button.
 *
 * This is the opposite call from `write/ConfirmMark`, and deliberately: there,
 * one status covers two causes the server cannot tell apart, so echoing it would
 * assert the wrong one. Here the mapping is one key to one sentence, and the
 * refusals are about the *actor's* rights rather than about somebody else's
 * document.
 *
 * **`detail`, not `message`, and that is the whole of the second condition.**
 * `message` is never empty: when the body carried no `detail` string,
 * `fetchJson` fills it with `res.statusText`, which is English. A 4xx is not a
 * guarantee that a Persian sentence was written — FastAPI answers 422 with
 * `detail` as a **list**, so `/api/users/abc` would put «Unprocessable Entity»
 * on this screen, and a proxy-generated 429 or 413 arrives with no JSON body at
 * all. `ApiError.detail` is `null` in exactly those cases, and this asks for it
 * by name rather than inferring from the status which 4xx the server wrote for.
 *
 * A 5xx is not a refusal at all, so it too gets the local retry line rather than
 * a framework's English `statusText`.
 */
function refusalText(error: unknown): string {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500
      && error.detail !== null) {
    return error.detail
  }
  return FAILED
}

/**
 * One person's record, and the two acts an administrator performs on it
 * (D13, D14, D15).
 *
 * **Read-only for anyone this administrator may not act on.** `mayManage` is the
 * client twin of `delegation.may_modify`: the account is still shown — the
 * surface is `*`-gated, so everyone who reaches it may see everyone — while the
 * controls whose every press would come back refused are not drawn at all. The
 * two reasons that arise say different things, because "you cannot edit
 * yourself, go to your profile" and "this account holds more than you do" send
 * an administrator to different places.
 *
 * `mayManage` cannot answer for `LAST_EDITOR`, which counts rows this screen
 * never reads, so a refusal can still arrive at a control that was drawn — and
 * the alert repeats the server's sentence rather than assuming the screen
 * predicted every answer.
 *
 * The supervisor is displayed and not editable here: choosing one needs the
 * candidate picker, which is the next task's. What this screen owes D14 is the
 * *warning*, since a disabled supervisor is left in place rather than quietly
 * repointed, and nothing else in the app would ever mention it.
 */
export function UserDetail() {
  const { id = '' } = useParams()
  const session = useSession().data
  const refusal = administrationRefusal(session)
  const { data: user, error, refetch } = useUser(id, {
    enabled: !!session && refusal === undefined,
  })
  const setDisabled = useSetUserDisabled(id)
  const setPassword = useSetUserPassword(id)
  const [password, setPasswordValue] = useState('')
  const [tooShort, setTooShort] = useState(false)

  // Hooks first, then the early returns.
  if (!session) return <div className="flex-1 bg-bg" />
  if (refusal) return <RefusalScreen status={refusal} />
  const refused = refusalStatus(error)
  if (refused) return <RefusalScreen status={refused} />
  // Ahead of the blank, and for the same reason the list checks it ahead of
  // `data ?? []`: `!user` was every failure that is not 403 or 404 as well as
  // the moment before the read lands, so a 500 — or the 422 that
  // `get_user(user_id: int)` answers for `/users/abc`, one typed URL away since
  // `:id` matches any string — was a page that stayed empty for ever with
  // nothing on it to say so or to try again with.
  if (error) {
    return <LoadFailedScreen message="اطلاعات این کاربر بارگذاری نشد." error={error}
      onRetry={() => { void refetch() }} />
  }
  if (!user) return <div className="flex-1 bg-bg" />

  const mine = session.username === user.username
  const manageable = mayManage(session, user)

  function submitPassword() {
    // Both flags reset on every attempt: a complaint left over from the last try
    // sits under the one now in flight and reads as a fresh rejection of a value
    // that was fine.
    setPassword.reset()
    if (password.length < MIN_PASSWORD) {
      setTooShort(true)
      return
    }
    setTooShort(false)
    setPassword.mutate(password, { onSuccess: () => setPasswordValue('') })
  }

  return (
    <div className="flex-1 overflow-auto py-s12 px-s12">
      <div className="max-w-list mx-auto">
        <Link to="/users" className="text-caption text-violet no-underline">
          ← فهرست کاربران
        </Link>

        <div className="flex items-center gap-s6 flex-wrap mt-s5">
          <h1 className="text-title font-extrabold text-ink">{user.displayName}</h1>
          <StatusPill tone={user.disabled ? 'neutral' : 'ok'}
            label={user.disabled ? 'غیرفعال' : 'فعال'} />
          <span dir="ltr" className="text-caption text-muted font-mono">{user.username}</span>
        </div>

        <Card className="px-s9 py-s8 mt-s8 flex flex-col gap-s7">
          <Row label="نقش">
            <span className="text-body text-ink">{user.role ?? '—'}</span>
          </Row>

          <Row label="دامنهٔ دسترسی">
            {/* Every scope, never `scopes[0]`: a head of two departments holds
                two rows, and showing one of them hides half of what they reach. */}
            <span className="flex gap-s4 flex-wrap">
              {user.scopes.length === 0
                ? <span className="text-body text-muted">هیچ دامنه‌ای</span>
                : user.scopes.map((scope) => (
                  <span key={scope} className="text-caption text-violet bg-tile-v px-s5 py-s2 rounded-chip">
                    {scope === '*' ? 'همهٔ دپارتمان‌ها' : scope}
                  </span>
                ))}
            </span>
          </Row>

          <Row label="سرپرست">
            <span className="flex flex-col gap-s2">
              <span className="text-body text-ink">
                {user.supervisor ? user.supervisor.displayName : 'سرپرستی ندارد'}
              </span>
              {user.supervisor?.disabled && (
                <span className="text-caption text-warn font-bold">
                  {SUPERVISOR_GONE}؛ تأیید نظرهای این کاربر جایی برای رفتن ندارد.
                </span>
              )}
            </span>
          </Row>

          <Row label="سرپرستی">
            {/* D51 — an org-chart fact, not a capability. It routes comment
                approval (D34) and grants nothing whatever: a Reader may
                supervise a Reader, and an Admin without the flag supervises
                nobody. Drawn beside the role with no qualification it reads as a
                permission, and would then be set to give somebody something. */}
            <span className="flex flex-col gap-s2">
              <span className="text-body text-ink">
                {user.canSupervise ? 'می‌تواند سرپرست دیگران باشد' : 'نمی‌تواند سرپرست دیگران باشد'}
              </span>
              <span className="text-caption text-faint">
                این یک جایگاه در نمودار سازمانی است و هیچ دسترسی‌ای نمی‌دهد.
              </span>
            </span>
          </Row>

          <Row label="تاریخ ساخت">
            {/* `createdAt` is unix **seconds** — `unixepoch()` on the server, not
                the ISO string every other timestamp in this app carries. Handed
                to `jalali` raw it is read as milliseconds and prints ۱۳۴۸/…,
                five decades off and perfectly plausible-looking. */}
            <span className="text-body text-ink">
              {jalali(new Date(user.createdAt * 1000).toISOString())}
            </span>
          </Row>
        </Card>

        {manageable ? (
          <div className="flex flex-col gap-s8 mt-s10">
            <Card className="px-s9 py-s8">
              <h2 className="text-subtitle font-bold text-ink">وضعیت حساب</h2>
              <p className="text-caption text-muted mt-s3">
                غیرفعال کردن یک حساب همهٔ نشست‌های آن را می‌بندد. شمارهٔ کاربر نزد
                خودش می‌ماند و به کس دیگری داده نمی‌شود.
              </p>
              <div className="mt-s6">
                {/* `Button`'s BASE carries no horizontal padding and no type size
                    on purpose (I5) — the call site owns both — so a bare
                    `<Button>` is a 44 px box with its text against the edges, at
                    inherited body size. jsdom measures nothing, so only a
                    browser ever shows it. */}
                <Button
                  variant={user.disabled ? 'green' : 'coral'}
                  className="px-s8 text-caption"
                  loading={setDisabled.isPending}
                  loadingLabel="در حال ثبت…"
                  onClick={() => setDisabled.mutate(!user.disabled)}
                >
                  {user.disabled ? 'فعال‌سازی حساب' : 'غیرفعال‌سازی حساب'}
                </Button>
              </div>
              {setDisabled.error && (
                // role="alert": this text appears after the click that caused
                // it, so a screen reader is elsewhere on the page when it
                // arrives and would otherwise never be told.
                <p role="alert" className="text-caption text-conflict mt-s5">
                  {refusalText(setDisabled.error)}
                </p>
              )}
            </Card>

            <Card className="px-s9 py-s8">
              <h2 className="text-subtitle font-bold text-ink">گذرواژه</h2>
              <p className="text-caption text-muted mt-s3">
                گذرواژهٔ تازه را خودتان انتخاب می‌کنید و به این شخص می‌گویید؛ پیوند
                بازیابی‌ای در کار نیست.
              </p>
              <div className="flex items-end gap-s5 flex-wrap mt-s6">
                <label className="flex flex-col gap-s2 flex-1 min-w-0">
                  <span className="text-caption font-bold text-muted">گذرواژهٔ تازه</span>
                  <input
                    type="password"
                    value={password}
                    autoComplete="new-password"
                    onChange={(e) => setPasswordValue(e.target.value)}
                    className="min-h-touch w-full px-s7 rounded-control border border-line bg-card text-body text-ink"
                  />
                </label>
                <Button variant="violet" className="px-s8 text-caption"
                  loading={setPassword.isPending} loadingLabel="در حال ثبت…"
                  onClick={submitPassword}>
                  ثبت گذرواژه
                </Button>
              </div>
              {(tooShort || setPassword.error) && (
                <p role="alert" className="text-caption text-conflict mt-s5">
                  {tooShort ? TOO_SHORT : refusalText(setPassword.error)}
                </p>
              )}
              {setPassword.isSuccess && !tooShort && (
                // D15 has no delivery channel of its own, so the administrator
                // is the delivery channel and has to be told so; and the
                // revocation is invisible on this screen, so it is said in
                // words rather than left to be discovered by the person who
                // suddenly cannot use their open tab.
                <p role="status" className="text-caption text-green font-bold mt-s5">
                  گذرواژهٔ تازه ثبت شد؛ آن را به این شخص بگویید. همهٔ نشست‌های این
                  کاربر بسته شد.
                </p>
              )}
            </Card>
          </div>
        ) : (
          <p className="text-caption text-muted mt-s10">
            {mine
              // D13, and the server's own SELF_EDIT sentence: this is the one
              // account nobody administers from here, and there is somewhere
              // else to go for the one thing they may change.
              ? 'حساب خودتان را از این صفحه نمی‌توانید تغییر دهید؛ گذرواژهٔ خودتان را از صفحهٔ نمایه عوض کنید.'
              : 'دسترسی این حساب از دسترسی شما بیشتر است، پس تغییر آن از اینجا ممکن نیست.'}
          </p>
        )}
      </div>
    </div>
  )
}

/** One labelled fact. A `<dl>` pair would be the honest markup for the block,
 *  but it cannot hold the per-row flex layout without a wrapper that breaks the
 *  dt/dd association, so the label is bound to its value by proximity and by the
 *  bold/plain contrast every other record in this app uses. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-s6 flex-wrap">
      <span className="text-caption font-bold text-muted">{label}</span>
      {children}
    </div>
  )
}
