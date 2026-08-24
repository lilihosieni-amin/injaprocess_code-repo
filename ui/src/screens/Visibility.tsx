import { useSession } from '../auth/useSession'
import { visibilityRefusal } from '../auth/can'
import { useVisibility, useSetVisibilityField } from '../api/hooks'
import { refusalStatus } from '../api/client'
import { LoadFailedScreen, ScreenSkeleton } from '../ui/states'
import { RefusalScreen } from './Refusal'
import { Card } from '../ui/Card'
import { TickBox } from '../ui/Checkbox'
import type { PolicyField } from '../api/types'

/** The two words §6.12 puts at the end of every row. Exported so the screen
 *  and its test cannot come to word the same state differently. */
export const STATE_ON = 'نمایش داده می‌شود'
export const STATE_OFF = 'پنهان است'

/** The six switches, in the order the store lists them: the process's own record
 *  first, then a node's. The labels name what a reader would see, never the
 *  storage key. */
const ROWS: { field: PolicyField; label: string; hint: string }[] = [
  { field: 'process_summary', label: 'خلاصهٔ فرآیند',
    hint: 'متن کوتاهی که کارِ کلی فرآیند را توضیح می‌دهد.' },
  { field: 'process_idef0', label: 'نمای IDEF0 فرآیند',
    hint: 'ورودی‌ها، کنترل‌ها، خروجی‌ها و مکانیزم‌های سطح فرآیند.' },
  { field: 'process_kpis', label: 'شاخص‌های کلیدی فرآیند',
    hint: 'شاخص‌هایی که عملکرد این فرآیند با آن‌ها سنجیده می‌شود.' },
  { field: 'node_description', label: 'توضیح فعالیت',
    hint: 'شرح هر باکس در فلوچارت.' },
  { field: 'node_actor', label: 'مسئول فعالیت',
    hint: 'نقشی که انجام هر فعالیت بر عهدهٔ اوست.' },
  { field: 'node_icom', label: 'ICOM فعالیت',
    hint: 'ورودی‌ها، کنترل‌ها، خروجی‌ها و مکانیزم‌های هر فعالیت.' },
]

/** The hint for a switch the server declared and this file has no wording for.
 *  Deliberately alarmed rather than neutral: an unlabelled row is a field that
 *  can be published by someone who cannot read what it is. */
const UNKNOWN_HINT =
  'تنظیم تازه‌ای که هنوز عنوان فارسی ندارد؛ تا روشن شدن معنای آن خاموش بماند.'

/** A failed flip, in the words `ConfirmMark` uses for the same thing. Every
 *  failure this endpoint has is worth retrying — a 403 or a 404 never reaches
 *  here, because the screen is already the refusal surface for both. */
const FAILED = 'انجام نشد؛ دوباره تلاش کنید.'

/**
 * What every non-editor sees of a process (spec D16, D17, D19).
 *
 * **One global policy.** Not a grant, not per-role, not per-department: what
 * varies between people is which departments and reports they can reach, never
 * which fields. The copy says so in as many words, because an Editor who reads
 * this screen as "hide the actor from *this* department" would be wrong in the
 * direction that publishes something.
 *
 * The department information page is not here (D55): it is shown in its
 * entirety, and there is no policy table for it.
 *
 * Every change is recorded with the actor, the field and both values (D19), and
 * moves the policy version — which is what every cached report is keyed on
 * (D27), so a switch takes effect on already-published documents rather than
 * leaving them serving what it just turned off. The version is a **digest of
 * the policy**, not a count of changes: flipping a switch and flipping it back
 * restores the earlier string, which is why nothing here calls it a revision or
 * suggests it grows.
 *
 * **The switch set comes from the server, not from `ROWS`.** `ROWS` supplies
 * wording and order and nothing else; a field the server declared that this
 * file has no wording for is still drawn (under its own key), and a field
 * `ROWS` names that the server does not know is not drawn at all. A hardcoded
 * six would make the first case a field silently published with no way to turn
 * it off, and the second an always-off switch for something that does not
 * exist.
 */
export function Visibility() {
  // **The server's own partition, in the server's own order** (D56).
  //
  // `routers/visibility.py` gates both directions on
  // `requires("set_visibility", "*")`, and `access.requires` checks SCOPE
  // BEFORE CAPABILITY — *"the order is the whole point … 404 the target is
  // outside the caller's scope; they must not learn it exists"*. So a
  // department-scoped caller who types `/visibility` is answered **404** by the
  // API, and `tests/test_reader_sees_no_users.py:413` pins exactly that.
  //
  // This screen used to write one status for two different refusals —
  // `can('set_visibility', '*')` and then a flat `<RefusalScreen status={403}/>`
  // — so that caller was told «اجازهٔ این کار را ندارید»: *this exists, but not
  // for you*, about a surface D56 reserves the 404 for. The owner ruled it
  // directly: "i ok with not found 404."
  //
  // `visibilityRefusal` is the same twin `/users` and `/users/:id` already use,
  // one capability along; a fourth local copy of the partition is how the three
  // would come to disagree. Cosmetic either way (D48) — this decides what to
  // draw, the server decides what to answer.
  const session = useSession().data
  const refusal = visibilityRefusal(session)
  // `!!session` as well as the partition, exactly as `Users` writes it:
  // `visibilityRefusal` answers `undefined` for a session that has not arrived
  // yet — nobody has said what this person may do — and NFR-12 / AC-24 want a
  // refused caller to fire no request at all.
  const { data, error, refetch } = useVisibility({
    enabled: !!session && refusal === undefined,
  })
  const set = useSetVisibilityField()

  // Hooks first, then the early returns: an early return above them would change
  // hook order between renders the moment the session or the policy arrives.
  if (!session) return <div className="flex-1 bg-ink" />
  if (refusal) return <RefusalScreen status={refusal} />
  const refused = refusalStatus(error)
  if (refused) return <RefusalScreen status={refused} />
  // Ahead of the blank, and that order is the whole fix. `refusalStatus` maps
  // 403 and 404 only, so every other failure — a 500 above all — fell through to
  // `!data` and drew a page that stayed empty for ever, with nothing on it to
  // say the policy had not loaded and nothing to try again with. There is no 422
  // half here: this screen takes no path parameter.
  if (error) {
    return <LoadFailedScreen message="تنظیم نمایش محتوا بارگذاری نشد." error={error}
      onRetry={() => { void refetch() }} />
  }
  // The in-flight blank paints the FIELD, not `--bg`. `--bg` is the warm cream
  // this app never paints a screen on and the shell behind this is `--ink`;
  // `background-color` does not inherit, which is the very reason the root below
  // repeats `bg-ink`. Measured in Chrome at 1440x1000 with the policy read hung:
  // a full-viewport cream block over the violet field.
  // Owner ruling — see `ScreenSkeleton`. One card, which is what this screen
  // is: a single panel of switches.
  if (!data) return <ScreenSkeleton column="access" cards={1} />

  const fields = data.fields as Record<string, boolean>
  const rows = [
    ...ROWS.filter((r) => r.field in fields),
    // `as PolicyField` because the union is this file's best knowledge of the
    // server's vocabulary and the server is the authority on it. The cast is
    // load-bearing only for `set.mutate`, which puts the name straight into the
    // path — and an unknown name there is the 404 the endpoint documents.
    ...Object.keys(fields)
      .filter((f) => !ROWS.some((r) => r.field === f))
      .map((f) => ({ field: f as PolicyField, label: f, hint: UNKNOWN_HINT })),
  ]

  return (
    // §6.0 — the shell owns the violet field and this root repaints it,
    // because the browser gate reads `background-color` off THIS element with
    // `getComputedStyle`, which does not inherit — the same reason every other
    // full-bleed screen (`Overview`, `UserDetail`, `Users`) repeats `bg-ink` on
    // its own `[data-screen]` even though `PanelShell` already paints it.
    <div data-screen="policy"
      className="flex-1 overflow-auto bg-ink py-screen-y px-screen-x max760:px-s7 max760:py-s9">
      <div data-col className="max-w-access mx-auto">
        <h1 data-h1 className="text-title font-extrabold text-role-title-on-field m-0">سیاست نمایش محتوا</h1>
        {/* §6.12 — the intro makes the framing explicit: a decision applied to
            every non-editor, not a permission granted to anybody. `13px
            --violet-on-dark-body lh 1.8` capped at 600px, on the violet field.

            Two `<p>`s, not one: the D16 sentence and the D55 sentence are each
            pinned verbatim by their own behavioural test above, matched as the
            WHOLE text of one element. Folding them into a single paragraph —
            which is what would happen by literally concatenating them — makes
            neither substring the full text of anything, and both queries stop
            finding an element. */}
        <p data-body className="text-fs-sm text-role-subtitle-on-field leading-loose max-w-intro mt-s4 m-0">
          این تنظیم برای همهٔ کسانی که اجازهٔ ویرایش ندارند یکسان است.
        </p>
        <p className="text-fs-sm text-role-subtitle-on-field leading-loose max-w-intro mt-s2 m-0">
          معرفی دپارتمان همیشه به‌طور کامل نمایش داده می‌شود و تنظیمی ندارد.
        </p>

        {/* One card, not six. `Card` imported rather than re-declared: this
            screen carried `bg-card border border-warm rounded-card shadow-card`
            inline, byte for byte identical to the primitive it did not use. */}
        <Card data-card role="group" aria-label="سیاست نمایش محتوا"
          aria-busy={set.isPending || undefined}
          className={`px-s9 py-s4 mt-s10 transition-opacity
                      ${set.isPending ? 'opacity-60' : ''}`}>
          <ul className="list-none p-0 m-0">
            {rows.map(({ field, label, hint }) => {
              const on = fields[field]
              const failed = set.error && set.variables?.field === field
              return (
                <li key={field} role="listitem" aria-label={label}
                  className="border-b border-hair last:border-b-0">
                  <label className="flex items-start gap-s6 py-s7 px-s1 cursor-pointer
                                    transition-colors hover:bg-tile-v4
                                    max760:flex-wrap">
                    {/* `aria-label` even though the label wraps the control:
                        the accessible name computed from a wrapping label is
                        its WHOLE subtree, so without this every row is
                        announced as its title, its explanation and its state
                        word run together. */}
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={set.isPending}
                      aria-label={label}
                      aria-describedby={`vis-hint-${field}`}
                      onChange={(e) => set.mutate({ field, visible: e.target.checked })}
                      className="peer sr-only"
                    />
                    {/* The drawn tick is `TickBox` (Task 8), not `Checkbox`:
                        `Checkbox` owns its own `<label>`, its own background
                        recipe and a single fixed hint string, none of which
                        fit a table row that also carries a trailing state word
                        and a per-row failure line. Re-implementing the square
                        itself here — rather than reusing the primitive that
                        already carries ledger L-48's violet fill and L-09's
                        `--border-pick` off-border — would be exactly the F6
                        defect this screen exists to remove. */}
                    <TickBox on={on} rung="row" className="peer-focus-visible:border-coral" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-fs-menu font-bold text-ink">{label}</span>
                      <span id={`vis-hint-${field}`}
                        className="block text-fs-xs text-muted leading-normal mt-s2">
                        {hint}
                      </span>
                      {failed && (
                        // §4.6 — "Errors are stated in copy: a `11.5px/600
                        // --conflict` line under the offending control." It used
                        // to be one bare red line hanging under the last card,
                        // naming no field, while the switch that failed sprang
                        // back to the server's value in silence.
                        <span role="alert"
                          className="block text-fs-xs font-semibold text-conflict mt-s3">
                          {FAILED}
                        </span>
                      )}
                    </span>
                    {/* The word §6.12 puts at the far end of the row, and the
                        reason the row is not 60% empty. `11px/600`, green when
                        shown and muted when hidden. */}
                    <span className={`ms-auto shrink-0 text-fs-xxs font-semibold
                                      ${on ? 'text-green' : 'text-muted'}`}>
                      {on ? STATE_ON : STATE_OFF}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </Card>

        <p className="text-fs-xs text-faint mt-s10 m-0">
          {/* F8/F9 — the label used to sit inside `font-mono`, a latin stack
              with no Persian glyphs, so «نسخهٔ تنظیم:» fell through to whatever
              the OS substituted; and the digest, which can hold a `-` or a `_`,
              bidi-reordered inside the Persian sentence. Only the digest is
              mono, and only the digest is pinned. */}
          نسخهٔ تنظیم: <span dir="ltr" className="font-mono">{data.version}</span>
        </p>
      </div>
    </div>
  )
}
