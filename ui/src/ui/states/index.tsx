import { retryQuery } from '../../api/client'
import { Button } from '../Button'
import { Card } from '../Card'

export function LoadingState({ rows = 3 }: { rows?: number }) {
  // F12 — skeletons shaped like the content, so nothing shifts when data lands.
  return (
    <div role="status" aria-busy="true" aria-label="در حال بارگذاری" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} data-testid="skeleton-row"
          className="h-s16 rounded-card bg-tile-v2 animate-pulse" />
      ))}
    </div>
  )
}

/**
 * §5.2 — the design gives emptiness three forms, by what contains it.
 *
 * The card's `48px 20px` is two numbers on two axes and the _ds ladder holds
 * neither (30 and 38 straddle 48; 18 and 22 straddle 20), so it is two tokens —
 * `--pad-empty-y` / `--pad-empty-x` — exactly as the nine control-geometry
 * values beside them in tokens.css are. It shipped at `p-s12` (30px both ways),
 * which is 18px short on the axis a screen reads first.
 */
const EMPTY = {
  card: 'py-empty-y px-empty-x text-center',  // inside a card on a screen
  dashed: 'p-s9 text-center border border-dashed border-line rounded-tile bg-card',
  inline: 'py-s16 px-s10 text-center',  // inside a table or a drawer
} as const

export function EmptyState({ title, hint, variant = 'card' }: {
  title: string
  hint?: string
  variant?: keyof typeof EMPTY
}) {
  // "Emptiness is a fact, not an apology" — the copy rule is the caller's;
  // the shape is this component's.
  const body = (
    <>
      <p className="text-subtitle font-bold text-ink m-0">{title}</p>
      {hint && <p className="text-fs-sm text-faint mt-s1 mb-0 leading-relaxed">{hint}</p>}
    </>
  )
  if (variant === 'card') return <Card className={EMPTY.card}>{body}</Card>
  return <div className={EMPTY[variant]}>{body}</div>
}

export function ErrorState({ message, onRetry, inline = false }: {
  message: string
  onRetry?: () => void
  /**
   * The shape a failure takes **inside** a box that is already a card — a
   * modal, a drawer, a table.
   *
   * Both user dialogs used to stand `LoadFailedScreen` in here, which is a
   * *page*: a 40px screen gutter, a 920px column that can never reach its width
   * inside 520, and this same bordered, shadowed card inside a bordered,
   * shadowed dialog — 56px of padding before the first word, and a picture that
   * reads as a rendering fault rather than as a failed read (F34/F40). §5.2's
   * inline empty shape (`text-align:center; padding:44px 20px; 13px;
   * --text-faint`) is what a modal has for this.
   *
   * `role="alert"` on this variant and not on the card: this text arrives
   * *after* a press — opening the dialog, or retrying inside it — while a screen
   * reader is somewhere else on the page. The full-page variant IS the page, so
   * a landing announcement would be furniture.
   */
  inline?: boolean
}) {
  const body = (
    <>
      <p
        role={inline ? 'alert' : undefined}
        className={inline
          ? 'text-fs-sm text-faint m-0 leading-relaxed'
          : 'text-subtitle font-bold text-ink m-0'}
      >
        {message}
      </p>
      {onRetry && (
        <div className="mt-s7">
          <Button variant="violet" onClick={onRetry} className="px-s8">تلاش دوباره</Button>
        </div>
      )}
    </>
  )
  if (inline) return <div className="py-empty-y-inline px-empty-x text-center">{body}</div>
  return <Card className="p-s12 text-center">{body}</Card>
}

/**
 * What a screen shows when a read produced neither data nor a refusal — a 5xx,
 * a 422, a dropped connection, a body that would not parse.
 *
 * It exists because the alternative each screen had was a *claim*: the user list
 * said «هنوز کاربری ثبت نشده است» to an administrator whose `/api/users` had
 * just 500'd; the record drew a permanently blank page for `/users/abc` (which
 * `get_user(user_id: int)` answers 422 to, and `:id` matches any string, so it
 * is one typed URL away); the visibility policy drew the same blank page for
 * ever; and the two user dialogs — which pass `data ?? []` into a list of roles
 * and a list of supervisor candidates — said «کسی نمی‌تواند سرپرست این کاربر
 * باشد» and advised narrowing the account's scope, on no evidence whatever.
 * None of those screens had anything to base what it said on, and the one
 * person told is the one who would act on it.
 *
 * **It lives here, beside the other four states, rather than in the first screen
 * that needed it.** It had five callers across three files while it was still
 * exported from `screens/Users.tsx`, which made a user-list module an import
 * dependency of the visibility screen.
 *
 * Whether to offer the retry is `retryQuery`'s decision and not a second copy of
 * it: it is the same predicate every query uses to decide whether asking again
 * could change the answer, so the button cannot come to disagree with the
 * automatic retries about which failures are transient. No 4xx is — a 422 for a
 * non-numeric id will be a 422 every time — and a button that re-runs a settled
 * refusal is furniture that wastes the press.
 *
 * Laid out like `RefusalScreen`, because it stands in the same place.
 */
export function LoadFailedScreen({ message, error, onRetry }: {
  message: string
  error: unknown
  onRetry: () => void
}) {
  return (
    <div className="flex-1 overflow-auto py-screen-y px-screen-x max760:px-s7 max760:py-s9">
      <div className="max-w-list mx-auto">
        <ErrorState message={message} onRetry={retryQuery(0, error) ? onRetry : undefined} />
      </div>
    </div>
  )
}

export function DeniedState() {
  // F13 — for a refused *action* on something the user can see. Everything
  // out of scope is a 404 and renders NotFoundState instead.
  return (
    <Card className="p-s12 text-center">
      <p className="text-subtitle font-bold text-ink m-0">اجازهٔ این کار را ندارید</p>
      <p className="text-body text-muted mt-s2 mb-0">اگر فکر می‌کنید اشتباهی رخ داده، با سرپرست خود صحبت کنید.</p>
    </Card>
  )
}

export function NotFoundState() {
  // F13 — deliberately indistinguishable from a typo. No copy may hint that
  // something exists here and is being withheld; the UI cannot know, and saying
  // it would answer the question the 404 exists to refuse.
  return (
    <Card className="p-s12 text-center">
      <p className="text-subtitle font-bold text-ink m-0">چیزی اینجا نیست</p>
      <p className="text-body text-muted mt-s2 mb-0">نشانی را بررسی کنید یا به خانه برگردید.</p>
    </Card>
  )
}
