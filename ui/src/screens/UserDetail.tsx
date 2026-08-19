import { useId, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useSession } from '../auth/useSession'
import { administrationRefusal } from '../auth/can'
import { useDepartments } from '../api/hooks'
import {
  mayManage, useSetUserDisabled, useSetUserPassword, useUser, type AdminUser,
} from '../api/users'
import { refusalStatus } from '../api/client'
import { refusalText } from '../lib/refusal'
import { roleLabel } from '../lib/roles'
import { NO_DEPARTMENT, scopeLabel } from '../lib/scopes'
import { MIN_PASSWORD, TOO_SHORT } from '../lib/userDraft'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { PasswordField } from '../ui/PasswordField'
import { LoadFailedScreen } from '../ui/states'
import { EditUserDialog } from './EditUserDialog'
import { RefusalScreen } from './Refusal'

/**
 * One person's record — §6.8's Access screen: four panels in an 820px column on
 * the violet field.
 *
 * ## R5 is the whole composition
 *
 * "If a person cannot reach something it is not on their screen at all." The
 * account is still shown to everyone who reaches this surface — it is `*`-gated,
 * so everybody here already sees everybody — but the three panels whose every
 * press would come back refused are **absent**: not disabled, not explained, and
 * not a row that answers 404 when clicked. The deliverable states the same rule
 * structurally, wrapping the password and danger cards in
 * `<sc-if value="{{ canManageSel }}">` and drawing nothing where they are not.
 *
 * **The two sentences that used to stand here are gone with them.** They
 * explained, to somebody who could do nothing about either, why three panels
 * were missing: «this account holds more than you do» and «you cannot edit
 * yourself». R5 forbids that outright, and it does so even here, where the
 * refusal depends on the TARGET rather than on the caller — an administrator
 * looking at an account that holds more than they do is refused by the subset
 * rule, and is still shown nothing rather than told. The one thing in those two
 * sentences that was useful — "change your own password on the profile" — is a
 * destination and not a refusal, and `PanelShell` carries «نمایه» in the nav on
 * every screen; a sentence here was a second, worse route to a link already on
 * the page.
 *
 * ## The two gates, and the scope argument each one needs
 *
 * `administrationRefusal(session)` decides whether this screen exists for the
 * caller at all, and it checks **scope before capability** (D56): not scoped `*`
 * is a 404, `*` without `manage_users` is a 403. Reversed, a 403 would tell a
 * department-scoped caller that user administration exists.
 *
 * `mayManage(session, user)` decides what is drawn on it, and it carries the
 * scope clause itself — `scopeContains(held, wanted)` over every scope the
 * target holds. Neither gate is `can(capability)`, which reads capabilities and
 * ignores scope entirely; `PanelShell` was gating a nav entry that way and drew
 * an entry whose screen answered 403.
 *
 * `mayManage` cannot answer for `LAST_EDITOR`, which counts rows this screen
 * never reads, so a refusal can still arrive at a control that was drawn — and
 * the alert repeats the server's own sentence rather than assuming the screen
 * predicted every answer.
 *
 * Changing any fact on this record is `EditUserDialog`, which owns the candidate
 * picker and the diff that decides what is sent. What this screen owes D14 is
 * the *warning*, since a disabled supervisor is left in place rather than
 * quietly repointed, and nothing else in the app would ever mention it.
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
  const [editing, setEditing] = useState(false)
  const passwordId = useId()

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

  const manageable = mayManage(session, user)
  const disableLabel = user.disabled ? 'فعال‌سازی کاربر' : 'غیرفعال‌سازی کاربر'

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
    // §6.0 — the shell owns the violet field and this root repaints it, because
    // the gate reads `background-color` off THIS element with
    // `getComputedStyle`, which does not inherit.
    <div data-screen="access"
      className="flex-1 overflow-auto bg-ink py-screen-y px-screen-x max760:px-s7 max760:py-s9">
      <div data-col className="max-w-access mx-auto">
        {/* §8 — chevrons are chosen by hand per direction rather than
            transformed, and "back" is `M9 18l6-6-6-6`, which `ICONS` calls
            `chevronStart`: towards the start of a trail, and in a right-to-left
            reading that points RIGHT. The `←` this replaces was two violations
            in seven characters — a unicode glyph where §5.2 specifies inline
            line SVG, drawn pointing away from the screen it returns to — and a
            17px-tall hit target with no hover (F14).

            The colour is NOT the deliverable's `#4A25A9`: that is the back
            button on the panel's white crumb strip, and this link sits on the
            violet field, where `--violet` on `--ink` measures 1.6:1 and the
            harness census reads it as text nobody can see. It takes the field's
            own secondary, the same `--violet-on-violet` the username under it
            is drawn in. The Access screen has no back control in the
            deliverable at all, so there is no drawn value to take. */}
        <Link to="/users"
          className="inline-flex items-center gap-s3 min-h-touch px-s6 rounded-control
                     text-fs-sm2 font-semibold text-violet-on-violet no-underline
                     hover:text-role-title-on-field transition-colors">
          <Icon name="chevronStart" className="w-chevron h-chevron" stroke={2.4} />
          فهرست کاربران
        </Link>

        <div className="flex items-center justify-between gap-s7 flex-wrap mt-s5 mb-s4">
          <div className="min-w-0">
            <h1 data-h1 className="text-title font-extrabold text-role-title-on-field">
              {user.displayName}
            </h1>
            {/* §6.8 — the username is a latin run on a violet field: mono,
                `--violet-on-violet`, pinned `ltr`, aligned to the START. It was
                absent from this screen's header entirely. `text-start` is
                written out because the deliverable writes it out: inside an RTL
                column an LTR run would otherwise be read as end-aligned by
                anyone skimming, and `start` is what it is. */}
            <span data-body dir="ltr"
              className="block text-fs-sm2 font-mono text-violet-on-violet text-start mt-s2">
              {user.username}
            </span>
          </div>
          {/* R5 — the edit control is drawn only for a viewer the server would
              really let write. The deliverable gates the same button on
              `canManageSel`. */}
          {manageable && (
            <Button variant="violet" className="px-s8 py-s6 text-fs-sm rounded-button flex-none"
              onClick={() => setEditing(true)}>
              ویرایش
            </Button>
          )}
        </div>

        <RoleAndScopePanel user={user} />

        {/* §6.8 panel 2. The supervisor is an org-chart position (D51): it
            routes comment approval and grants nothing whatever, which is said
            in the design's own rule-statement register — 11.5px, faint, 1.7 —
            rather than as a second body paragraph that would read as a
            permission. */}
        <Panel eyebrow="سرپرست" label="سرپرست"
          actions={manageable && (
            // §6.8 gives this the row-action size: `10px 15px`, 12.5px,
            // radius 11. It opens the one editing surface this app has —
            // §6.9's dedicated change-supervisor modal has no counterpart
            // here, because `EditUserDialog` owns the edge, the scopes and the
            // re-validation that binds them (see the ledger).
            <Button variant="ghost"
              className="px-button-x py-s5 text-fs-sm2 rounded-input"
              onClick={() => setEditing(true)}>
              تغییر سرپرست
            </Button>
          )}>
          <p className="text-fs-menu font-bold text-ink">
            {user.supervisor ? user.supervisor.displayName : 'سرپرستی ندارد'}
          </p>
          {user.supervisor?.disabled && (
            // D14 — a disabled supervisor is left in place rather than quietly
            // repointed, so the gap is stated here or nowhere.
            <p className="text-fs-xs font-semibold text-conflict mt-s1">
              این سرپرست غیرفعال است — کامنت‌های این کاربر یک پله بالاتر می‌روند.
            </p>
          )}
          <p className="text-fs-xs text-faint leading-normal mt-s1">
            سرپرست جایگاهی در نمودار سازمانی است، تأیید نظرها را مسیر می‌دهد و هیچ
            دسترسی‌ای نمی‌دهد.
            {user.canSupervise
              ? ' این کاربر خودش می‌تواند سرپرست دیگران باشد.'
              : ' این کاربر سرپرست کسی نمی‌شود.'}
          </p>
        </Panel>

        {manageable && (
          <>
            {/* §6.8 panel 3 — the design's shell, the app's control.
                The deliverable draws «ساختن لینک بازنشانی» and states that no
                password is ever created or shown. **This product has no reset
                link**: D15 is `POST /api/users/{id}/password`, a direct set of a
                value the administrator chooses and tells the person, because a
                deployment fed by Telegram has no channel to deliver a link over.
                R5 forbids drawing a button for a route that does not exist, so
                the white card, the type sizes and the primary's role are the
                design's and the copy and the control are the app's. */}
            <Panel tone="card" eyebrow="گذرواژه" label="گذرواژه">
              <h2 className="text-fs-menu font-bold text-ink">
                بازنشانی گذرواژهٔ {user.displayName}
              </h2>
              <p className="text-fs-caption text-muted leading-sub max-w-prose mt-s2">
                گذرواژهٔ تازه را خودتان انتخاب می‌کنید و به این شخص می‌گویید؛ پیوند
                بازیابی‌ای در کار نیست. با ثبت آن، همهٔ نشست‌های باز این کاربر بسته
                می‌شود.
              </p>
              <div className="flex items-end gap-s5 flex-wrap mt-s8
                              max760:flex-col max760:items-stretch">
                {/* F16/F35 — the bare `<input>` and its wrapping `<label>` that
                    stood here were the fourth of four labelled-input
                    implementations in this app, and the only one with no
                    `htmlFor`. §5.1.5's "invalid beats focus" comes with the
                    primitive, and the floor is stated under the control rather
                    than as a detached alert. */}
                <PasswordField id={passwordId} label="گذرواژهٔ تازه" value={password}
                  onChange={setPasswordValue} autoComplete="new-password"
                  className="flex-1 min-w-0"
                  invalid={tooShort} hint={tooShort ? TOO_SHORT : undefined} />
                <Button variant="violet" className="px-s8 py-s6 text-fs-sm rounded-button"
                  loading={setPassword.isPending} loadingLabel="در حال ثبت…"
                  onClick={submitPassword}>
                  ثبت گذرواژه
                </Button>
              </div>
              {setPassword.error && (
                // role="alert": this text appears after the click that caused
                // it, so a screen reader is elsewhere on the page when it
                // arrives and would otherwise never be told.
                <p role="alert" className="text-fs-xs font-semibold text-conflict mt-s5">
                  {refusalText(setPassword.error)}
                </p>
              )}
              {setPassword.isSuccess && !tooShort && (
                // D15 has no delivery channel of its own, so the administrator
                // IS the delivery channel and has to be told so; and the
                // revocation is invisible on this screen, so it is said in words
                // rather than discovered by the person whose open tab dies.
                <p role="status" className="text-fs-xs font-semibold text-green mt-s5">
                  گذرواژهٔ تازه ثبت شد؛ آن را به این شخص بگویید. همهٔ نشست‌های این کاربر
                  بسته شد.
                </p>
              )}
            </Panel>

            {/* §6.8 panel 4: white, a `1px --border-danger` edge, radius 16,
                padding 18, with a destructive ghost carrying the same label as
                the heading. The heading is the only `--conflict` title in the
                app and it is what makes the card readable as a boundary rather
                than as a fourth section. The deliverable binds ONE label and ONE
                button skin for both directions — there is no separate affirming
                variant for re-enabling, and re-enabling restores capabilities,
                so it is exactly as consequential as disabling. */}
            <Panel tone="danger" label={disableLabel}
              actions={
                <Button variant="danger" className="px-s8 py-s6 text-fs-sm rounded-button"
                  loading={setDisabled.isPending} loadingLabel="در حال ثبت…"
                  onClick={() => setDisabled.mutate(!user.disabled)}>
                  {disableLabel}
                </Button>
              }>
              <h2 className="text-fs-menu font-bold text-conflict">{disableLabel}</h2>
              <p className="text-fs-caption text-muted leading-sub max-w-prose mt-s2">
                غیرفعال کردن یک حساب همهٔ نشست‌های آن را می‌بندد. شمارهٔ کاربر نزد خودش
                می‌ماند و به کس دیگری داده نمی‌شود.
              </p>
              {setDisabled.error && (
                <p role="alert" className="text-fs-xs font-semibold text-conflict mt-s5">
                  {refusalText(setDisabled.error)}
                </p>
              )}
            </Panel>

            {/* Mounted only while it is open: the roles and the candidate list
                are not two requests on every visit to somebody's record, and a
                second opening starts on the account as it now stands. */}
            {editing && (
              <EditUserDialog user={user} open onClose={() => setEditing(false)} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * §6.8 panel 1 — the role and the departments this account reaches.
 *
 * **The registry is read here and not in the screen** so that a caller the
 * surface refuses fires no request for it. The refusals above are early returns
 * *after* the hooks, so a `useDepartments()` in the screen body would ask the
 * server for the department list on behalf of somebody who is about to be shown
 * a 404 — the same defect `useUser`'s `enabled` flag exists to prevent one line
 * further up.
 *
 * Every scope, never `scopes[0]`: a head of two departments holds two rows, and
 * showing one of them hides half of what they reach.
 */
function RoleAndScopePanel({ user }: { user: AdminUser }) {
  const { data: departments } = useDepartments()
  const names = Object.fromEntries((departments ?? []).map((d) => [d.code, d.name]))

  return (
    <Panel card eyebrow="نقش و دپارتمان" label="نقش و دپارتمان">
      <div className="flex items-center gap-s5 flex-wrap">
        {/* In Persian, like every other word on this record. `roleLabel` keeps
            the identifier for a role seeded on the server ahead of this build —
            quoted is legible, and «—» would say the account has no role at all. */}
        <span className={SCOPE_CHIP}>{roleLabel(user.role)}</span>
        {/* The `1px --warm` rule is the only thing on this panel that says
            "these are two different kinds of fact", so the design draws it
            rather than leaving it to spacing — and it is the one thing here
            that goes at ≤760px, where the chips wrap and a vertical rule
            between two wrapped rows says nothing. */}
        <span aria-hidden className="w-px self-stretch bg-warm max760:hidden" />
        <div className="flex items-center gap-s4 flex-wrap min-w-0">
          {user.scopes.length === 0
            ? <span className="text-fs-sm2 text-muted">{NO_DEPARTMENT}</span>
            : user.scopes.map((scope) => (
              <span key={scope} className={SCOPE_CHIP}>{scopeLabel(scope, names)}</span>
            ))}
        </div>
      </div>
    </Panel>
  )
}

/**
 * §5.2's scope chip: `12.5px/600 --ink` on `--tile-v2` behind a `1.5px --line`
 * edge, radius 10.
 *
 * Written here rather than taken from `src/ui/Chip.tsx`, which ships four ICOM
 * kinds (`input`/`control`/`output`/`mech`) and no scope skin — see this task's
 * report. The 7px the deliverable draws for the vertical padding has no token
 * of that role either (the five 7px keys on the scale are a popover inset, a
 * stat label's margin, a stat dot's gap, the crumb back button's vertical
 * padding and a button's icon gap), so this takes the ladder's 8px rung rather
 * than borrowing one of them or minting an unreviewed sixth.
 */
const SCOPE_CHIP =
  'inline-flex items-center flex-none text-fs-sm2 font-semibold text-ink ' +
  'bg-tile-v2 border-hairline border-line px-s6 py-s4 rounded-control'

/**
 * One §6.8 panel: white, radius 16, 18px of padding, 14px below it, and an
 * eyebrow that is the section's accessible name.
 *
 * **Local, and it should not stay local.** `src/ui/SectionCard.tsx` is this box
 * — right radius, right padding, right eyebrow — and this screen cannot use it
 * for three separate reasons, none of which this task may fix: it destructures
 * `{ eyebrow, skin, children, className }` and forwards nothing else, so neither
 * a `data-card` measurement hook nor an `aria-label` reaches the DOM; it has no
 * `actions` slot, which two of these four panels need; and neither of its two
 * skins is the one §6.8 draws (`tint` is `--surface-sub` over `--border-current`
 * and `white` is `--card` over `--border-card` **with** the card shadow, while
 * panels 1 and 2 here are `--card` over `--border-current` with **no** shadow).
 * The two files reconcile in one commit by whoever owns both.
 *
 * `role="group"` rather than `<section aria-labelledby>`: an accessibly-named
 * `<section>` is a landmark `region`, and four landmarks on one record is a
 * screen reader announcing furniture. These are groupings of related controls.
 */
function Panel({
  tone = 'sub', eyebrow, label, actions, card = false, children,
}: {
  /** Which of §6.8's three panel skins. */
  tone?: 'sub' | 'card' | 'danger'
  eyebrow?: string
  /** The accessible name. Panel 4 has no eyebrow, so it cannot come from one. */
  label: string
  actions?: ReactNode
  /** Carries `[data-card]`, the harness's card hook. Panel 1 only, and the
   *  harness takes the FIRST match in document order, so a second would be
   *  measured by nothing and would silently claim to be measured. */
  card?: boolean
  children: ReactNode
}) {
  return (
    <div role="group" aria-label={label} data-card={card ? '' : undefined}
      className={`border rounded-card p-s9 mb-s7 ${PANEL_SKIN[tone]}`}>
      {eyebrow !== undefined && (
        <p className="mb-s6 text-fs-xxs font-bold text-muted">{eyebrow}</p>
      )}
      {actions === undefined || actions === false ? children : (
        <div className="flex items-center justify-between gap-s6
                        max760:flex-col max760:items-stretch">
          <div className="min-w-0">{children}</div>
          <div className="flex-none max760:self-start">{actions}</div>
        </div>
      )}
    </div>
  )
}

const PANEL_SKIN: Record<'sub' | 'card' | 'danger', string> = {
  // Panels 1 and 2 — white on the sub-panel edge, and flat. Not `--surface-sub`:
  // the deliverable writes `background-color: var(--card)` on both.
  sub: 'bg-card border-border-current',
  // Panel 3 — the card recipe proper, shadow included.
  card: 'bg-card border-border-card shadow-card',
  // Panel 4 — the boundary.
  danger: 'bg-card border-border-danger',
}
