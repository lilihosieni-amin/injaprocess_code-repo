import { retryQuery } from '../../api/client'
import { Button } from '../Button'
import { Card } from '../Card'

/**
 * The columns the skeleton can stand in, by the screen that draws them.
 *
 * Named rather than taken as a class string: a screen's column is one of six
 * settled widths, and a caller free to pass any `max-w-*` could quietly give a
 * loading screen a different shape from the screen it is standing in for.
 */
const COLUMN = {
  list: 'max-w-list',
  summary: 'max-w-summary',
  steps: 'max-w-steps',
  access: 'max-w-access',
  departments: 'max-w-departments',
  reader: 'max-w-reader',
} as const

/** One pulsing block. Height and radius come off the token scale; the WIDTH is
 *  a fraction of its row, which no token can hold and none should — a
 *  skeleton's width is a proportion of the line it stands in. */
function Block({ h, w = 'w-full', r = 'rounded-card' }: { h: string; w?: string; r?: string }) {
  return <span className={`block ${h} ${w} ${r} bg-tile-v2 animate-pulse`} />
}

/**
 * **What a screen shows while it is still arriving** — owner ruling: *"i want to
 * add load status for page that makes time like process list.or departmant
 * details page.actually i want Skeleton Loading for each page."*
 *
 * Six screens returned `<div className="flex-1 bg-ink" />` while their query was
 * in flight: a violet rectangle, indistinguishable from a screen that had
 * finished and had nothing on it. On a phone against a real deployment that is
 * most of a second of a page that looks broken. `ProcessList` was worse than
 * blank — it drew its header and «فرآیندی برای این دپارتمان ثبت نشده است», so a
 * department with sixteen processes announced that it had none, every time.
 *
 * **It is the screen's own shell**, not a spinner in the middle of one: the same
 * field, the same gutters, the same column, so nothing moves sideways when the
 * content replaces it. What is drawn is a title, a lead line and `cards` blocks,
 * which is the shape every one of these screens has; the block heights are one
 * rung of the space scale rather than a measurement of each screen's real rows,
 * because a skeleton is an impression of a layout and not a copy of it.
 *
 * `role="status"` + `aria-busy` and a Persian name, so the wait is announced to
 * somebody who cannot see the pulse — which is the half of "loading state" a
 * shimmer alone never gives.
 */
export function ScreenSkeleton({ column, cards = 3, lead = true }: {
  column: keyof typeof COLUMN
  cards?: number
  lead?: boolean
}) {
  return (
    <div
      data-r-pad
      data-testid="screen-skeleton"
      className="flex-1 overflow-auto bg-ink py-screen-y px-screen-x max760:px-s7 max760:py-s9"
    >
      <div className={`${COLUMN[column]} mx-auto`}>
        {/* **`opacity-40`, and it is what makes this read as a placeholder.**
            Drawn at full strength the blocks are `--tile-v2` on the violet
            field — which is very nearly the white card each one stands in for,
            so five of them look like a screen that has finished loading and has
            five blank rows on it. At 40% they are the ghost of that card.

            Nested with `animate-pulse` rather than replacing it: opacities
            multiply, so the pulse still runs between 40% and 20% and the
            SHIMMER is what says "still coming" while the weight says "not yet
            content". A dimmer token instead of an opacity was the alternative
            and every candidate was a borrowed role — `--login-orb` is the login
            field's, `--violet-mid` the scrollbar thumb's — for a value that is
            not a colour decision at all. */}
        <div role="status" aria-busy="true" aria-label="در حال بارگذاری" className="opacity-40">
          <div className="flex flex-col gap-s5 mb-s10">
            <Block h="h-s11" w="w-1/3" r="rounded-button" />
            {lead && <Block h="h-s8" w="w-2/3" r="rounded-badge" />}
          </div>
          <div className="flex flex-col gap-s6">
            {Array.from({ length: cards }, (_, i) => <Block key={i} h="h-s16" />)}
          </div>
        </div>
      </div>
    </div>
  )
}

export function LoadingState({ rows = 3 }: { rows?: number }) {
  // F12 — skeletons shaped like the content, so nothing shifts when data lands.
  return (
    <div role="status" aria-busy="true" aria-label="در حال بارگذاری" className="flex flex-col gap-s6">
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
 * Laid out like `RefusalScreen`, because it stands in the same place — and
 * `Refusal.test.tsx` compares the two wrapper strings as sets rather than
 * naming a class at a time, because this docstring made that claim while the
 * two used a different width and a different gutter and every assertion either
 * file had still passed.
 */
export function LoadFailedScreen({ message, error, onRetry }: {
  message: string
  error: unknown
  onRetry: () => void
}) {
  return (
    <div className="flex-1 overflow-auto bg-ink py-screen-y px-screen-x max760:px-s7 max760:py-s9">
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
