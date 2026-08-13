import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { useVisibility, useSetVisibilityField } from '../api/hooks'
import { refusalStatus } from '../api/client'
import { RefusalScreen } from './Refusal'
import type { PolicyField } from '../api/types'

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
  const can = useCan(useSession().data)
  // `*`, not the bare capability: the endpoints require `set_visibility` at the
  // global scope, because one policy governs every department. Cosmetic either
  // way (D48) — this decides what to draw, the server decides what to answer.
  const allowed = can('set_visibility', '*')
  const { data, error } = useVisibility({ enabled: allowed })
  const set = useSetVisibilityField()

  // Hooks first, then the early returns: an early return above them would change
  // hook order between renders the moment the session or the policy arrives.
  if (!allowed) return <RefusalScreen status={403} />
  const refused = refusalStatus(error)
  if (refused) return <RefusalScreen status={refused} />
  if (!data) return <div className="flex-1 bg-bg" />

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
    <div className="flex-1 overflow-auto py-s12 px-s12">
      <div className="max-w-list mx-auto">
        <h1 className="text-title font-extrabold text-ink">نمایش محتوا</h1>
        <p className="text-caption text-muted mt-s4">
          این تنظیم برای همهٔ کسانی که اجازهٔ ویرایش ندارند یکسان است.
        </p>
        <p className="text-caption text-faint mt-s2">
          معرفی دپارتمان همیشه به‌طور کامل نمایش داده می‌شود و تنظیمی ندارد.
        </p>

        <div className="flex flex-col gap-s5 mt-s10">
          {rows.map(({ field, label, hint }) => (
            <label key={field}
              className="flex items-start gap-s6 bg-card border border-warm rounded-card px-s9 py-s8 shadow-card cursor-pointer">
              {/* `aria-label`, even though the <label> wraps the control: the
                  accessible name computed from a wrapping label is its WHOLE
                  subtree, so without this every switch is announced as its title
                  followed by its explanation run together. The hint stays
                  attached as the description instead, which is what it is. */}
              <input
                type="checkbox"
                aria-label={label}
                aria-describedby={`vis-hint-${field}`}
                checked={fields[field]}
                disabled={set.isPending}
                onChange={(e) => set.mutate({ field, visible: e.target.checked })}
                className="min-h-touch min-w-touch shrink-0 accent-violet"
              />
              <span className="min-w-0">
                <span className="block text-subtitle font-bold text-ink">{label}</span>
                <span id={`vis-hint-${field}`} className="block text-caption text-muted mt-s2">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        {set.error && (
          // role="alert" and not a bare span: this text appears after the click
          // that caused it, so a screen reader is elsewhere on the page when it
          // arrives and would never be told. A swallowed failure here is the
          // worst kind — the switch springs back to the server's value and the
          // Editor is left believing they published, or unpublished, something.
          <p role="alert" className="text-caption text-conflict mt-s6">{FAILED}</p>
        )}

        <p className="text-caption text-faint mt-s10 font-mono">
          نسخهٔ تنظیم: {data.version}
        </p>
      </div>
    </div>
  )
}
