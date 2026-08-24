import { useId, useState, type FormEvent } from 'react'
import { useSession } from '../auth/useSession'
import { useChangeOwnPassword } from '../api/hooks'
import { refusalText } from '../lib/refusal'
import { roleLabel } from '../lib/roles'
import { MIN_PASSWORD, TOO_SHORT } from '../lib/userDraft'
import { Button } from '../ui/Button'
import { PasswordField } from '../ui/PasswordField'
import { SectionCard } from '../ui/SectionCard'

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
  if (!session) return <div className="flex-1 bg-ink" />

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
    // `bg-ink` paints the violet field the harness's `field: FIELD` check reads
    // off `[data-screen]` itself (`getComputedStyle`, non-inherited) — the same
    // class every other rebuilt screen's own `data-screen` wrapper carries
    // (`Users.tsx`, `Summary.tsx`). The task brief's own Step 3 snippet omits
    // it; that omission is reported rather than followed.
    <div data-screen="profile" className="flex-1 overflow-auto bg-ink py-screen-y px-screen-x max760:px-s7 max760:py-s9">
      <div data-col className="max-w-profile mx-auto">
        {/* §6.13 — `22px/800 --card` name, `12.5px --violet-on-dark-body` role (ledger L-02,
            L-33 — NOT the 21px `text-fs-stat-sm` an earlier draft of this
            screen's task wrote; that role is the activity-stat numeral, which
            `tokens.css` says in as many words). The identity card this
            replaces was three lines of plain text plus a paragraph explaining
            why there is no edit control here; R5 puts that class of sentence
            out of the app, and the design's own profile has neither. The two
            facts worth keeping — who you are and what you are — are the
            header. */}
        <h1 data-h1 className="text-fs-h2 font-extrabold text-role-title-on-field m-0">
          {session.displayName}
        </h1>
        <p data-body data-testid="profile-meta"
          className="flex items-center gap-s4 flex-wrap text-fs-sm2
                     text-role-subtitle-on-field mt-s2 m-0">
          <span>{roleLabel(session.role)}</span>
          <span aria-hidden>·</span>
          {/* A latin-digit run inside RTL prose, pinned `ltr` so a stored
              spelling that is not digits alone stays in the order it was
              stored in. Declared in `test/guards.test.ts`'s ISLANDS. */}
          <span dir="ltr" className="font-mono">{session.username}</span>
        </p>

        {/* §6.13 — a tinted sub-panel eyebrowed «تغییر گذرواژه». This was a raw
            `<div>` reproducing `SectionCard`'s recipe byte for byte, because
            that component forwarded nothing but `className` and so could carry
            neither `data-card` (the harness's measurement hook) nor
            `role="group"` (a group of controls, not a fourth landmark on one
            record). Task 25 widened it; this is the shared box again. */}
        <SectionCard eyebrow="تغییر گذرواژه" label="تغییر گذرواژه" card className="mt-s8">
          <form onSubmit={submit} className="flex flex-col gap-s6">
            {/* `ground="sub"`: `ui/src/ui/fieldFrame.ts`'s own docstring on
                `PasswordFieldProps.ground` names this exact trio — "the
                reader's profile draws its password trio on the sub-panel
                surface" — as the reason the prop exists at all. Left at the
                default `'card'` (the brief's own Step 7 snippet does) draws
                each field as a near-white box on the `--surface-sub` tinted card,
                the very defect that docstring exists to prevent. */}
            <PasswordField id={currentId} label="گذرواژهٔ فعلی" placeholder="••••••••"
              autoComplete="current-password" ground="sub" value={current} onChange={setCurrent} />
            <div data-testid="password-pair"
              className="grid grid-cols-2 gap-s6 max760:grid-cols-1">
              <PasswordField id={nextId} label="گذرواژهٔ تازه" placeholder="••••••••"
                autoComplete="new-password" ground="sub" value={next} onChange={setNext} />
              <PasswordField id={repeatId} label="تکرار گذرواژهٔ تازه" placeholder="••••••••"
                autoComplete="new-password" ground="sub" value={repeat} onChange={setRepeat} />
            </div>

            {/* **Owner ruling — the amber notice is gone.** It said the other
                devices would be signed out, before the change, on the argument
                that a security effect nobody is warned about is one people
                avoid. The owner has read it on the screen and decided it is not
                worth the room: the success line below already says it («همهٔ
                دستگاه‌های دیگر از این حساب بیرون آمدند»), which makes the notice
                the same sentence twice — once as a warning and once as news. */}
            {/* §6.13's closing rule statement. The design's third clause is
                about a reset link this product does not have (D15, ledger
                A1/P2), so it states what actually happens instead. */}
            <p className="text-fs-xs text-faint leading-loose m-0">
              گذرواژهٔ خود را فقط خودتان می‌توانید تغییر دهید؛ هیچ‌کس دیگری گذرواژهٔ
              شما را نمی‌بیند. اگر آن را فراموش کردید، مدیر سامانه گذرواژهٔ تازه‌ای
              می‌گذارد و به شما می‌گوید.
            </p>

            <div className="mt-s2">
              {/* `loading` still forces `disabled`, which is what stops a
                  second submit landing behind the first with a `current` the
                  first request has already invalidated. */}
              <Button type="submit" variant="violet"
                className="px-s9 py-s6 text-fs-menu rounded-button"
                loading={change.isPending} loadingLabel="در حال ثبت…">
                ذخیرهٔ گذرواژه
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
            <p role="alert" className="text-fs-xs font-semibold text-conflict mt-s5 m-0">
              {problem ?? refusalText(change.error)}
            </p>
          )}
          {change.isSuccess && !problem && (
            <p role="status" className="text-fs-xs font-semibold text-green mt-s5 m-0">
              گذرواژهٔ شما عوض شد. دستگاه‌های دیگر از این حساب بیرون آمدند؛ همین
              دستگاه باز است.
            </p>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
