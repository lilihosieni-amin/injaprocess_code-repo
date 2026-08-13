import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '../auth/useSession'
import { administrationRefusal } from '../auth/can'
import { useUsers } from '../api/users'
import { refusalStatus, retryQuery } from '../api/client'
import { toLatinDigits } from '../lib/digits'
import { toFa } from '../lib/format'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { SearchField } from '../ui/SearchField'
import { StatusPill } from '../ui/StatusPill'
import { EmptyState, ErrorState, LoadingState } from '../ui/states'
import { NewUserDialog } from './NewUserDialog'
import { RefusalScreen } from './Refusal'
import type { AdminUser } from '../api/users'

/** What D14 surfaces instead of repointing. Written once and used on both
 *  screens, so the row and the record cannot come to word it differently. */
export const SUPERVISOR_GONE = 'سرپرست این کاربر غیرفعال است'

/**
 * What either screen shows when the read produced neither data nor a refusal —
 * a 5xx, a 422, a dropped connection, a body that would not parse.
 *
 * It exists because the alternative each screen had was a *claim*: the list said
 * «هنوز کاربری ثبت نشده است» to an administrator whose `/api/users` had just
 * 500'd, and the record drew a permanently blank page for `/users/abc` (which
 * `get_user(user_id: int)` answers 422 to, and `:id` matches any string, so it
 * is one typed URL away). Neither screen had any evidence for what it said, and
 * the one person told is the one who would act on it.
 *
 * Whether to offer the retry is `retryQuery`'s decision and not a second copy of
 * it: it is the same predicate the query itself uses to decide whether asking
 * again could change the answer, so the button cannot come to disagree with the
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
    <div className="flex-1 overflow-auto py-s12 px-s12">
      <div className="max-w-list mx-auto">
        <ErrorState message={message} onRetry={retryQuery(0, error) ? onRetry : undefined} />
      </div>
    </div>
  )
}

/**
 * Every account in the installation, and the way into one of them (D13, D14).
 *
 * **Gated, and gated with the server's own partition.** `administrationRefusal`
 * answers 404 for a department-scoped caller and 403 for a `*`-scoped one who
 * lacks `manage_users`, because `access.requires` checks scope before capability
 * and the two codes say different things (D56). The nav entry in `PanelShell` is
 * the only link here, so the only way to this screen without the right is by
 * typing the path — exactly the case a gate that lives in the header alone does
 * not cover. Cosmetic either way: every endpoint re-derives both halves (D48).
 *
 * **The search is over what is on screen, and over the number as it is stored.**
 * Ordinary Persian keyboards emit ۰۹…, the stored username is ASCII (D57), and
 * an unfolded query matches nothing while looking exactly like "no such person".
 *
 * The order is the server's — by `username`, because display names are not
 * unique and ordering by one would leave ties to the query plan and move rows
 * between two identical requests. Nothing is re-sorted here.
 */
export function Users() {
  const session = useSession().data
  const refusal = administrationRefusal(session)
  const { data, error, isPending, refetch } = useUsers({
    enabled: !!session && refusal === undefined,
  })
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)

  // Hooks first, then the early returns: an early return above them would change
  // hook order between renders the moment the session or the listing arrives.
  if (!session) return <div className="flex-1 bg-bg" />
  if (refusal) return <RefusalScreen status={refusal} />
  const refused = refusalStatus(error)
  if (refused) return <RefusalScreen status={refused} />
  // Before `data ?? []`, and that order is the whole fix: a failed read leaves
  // `data` undefined, and an empty array is indistinguishable from an
  // installation with no accounts in it. `refusalStatus` maps 403 and 404 only,
  // so every other failure — a 500 above all — fell through to the empty state
  // and told an administrator a fact about their installation that nothing on
  // this screen knew.
  if (error) {
    return <LoadFailedScreen message="فهرست کاربران بارگذاری نشد." error={error}
      onRetry={() => { void refetch() }} />
  }

  const users = data ?? []
  const query = q.trim()
  const digits = toLatinDigits(query)
  const list = users.filter((u) =>
    !query
    || u.displayName.includes(query)
    || u.username.includes(digits)
    || (u.role ?? '').includes(query))

  return (
    <div className="flex-1 overflow-auto py-s12 px-s12">
      <div className="max-w-list mx-auto">
        <div className="flex items-center justify-between gap-s6 flex-wrap">
          <h1 className="text-title font-extrabold text-ink">کاربران</h1>
          {/* Below the gate, and that is the whole placement decision: a
              department-scoped caller is answered «چیزی اینجا نیست» above and
              never reaches this line, so the app never draws a control into a
              wall it put up itself. */}
          <Button variant="violet" className="px-s8 text-caption"
            onClick={() => setCreating(true)}>
            کاربر تازه
          </Button>
        </div>
        <p className="text-caption text-muted mt-s4">
          هر کاربر یک نقش دارد و یک یا چند دامنهٔ دسترسی. سرپرست جایگاهی در نمودار
          سازمانی است و هیچ دسترسی‌ای نمی‌دهد.
        </p>

        {/* Mounted only while it is open, so the roles and the candidate list
            are not three requests on every page view — and a second opening
            starts blank rather than on the last attempt's half-filled form. */}
        {creating && <NewUserDialog open onClose={() => setCreating(false)} />}

        <div className="mt-s8">
          <SearchField label="جست‌وجوی کاربر" value={q} onChange={setQ}
            placeholder="نام، شماره یا نقش" />
        </div>

        {isPending ? (
          <div className="mt-s8"><LoadingState /></div>
        ) : list.length === 0 ? (
          <div className="mt-s8">
            <EmptyState
              title={users.length === 0 ? 'هنوز کاربری ثبت نشده است' : 'کاربری با این مشخصات پیدا نشد'}
              hint={users.length === 0 ? undefined : 'بخشی از نام، شماره یا نقش را بنویسید.'} />
          </div>
        ) : (
          <>
            <p className="text-caption text-faint mt-s8">
              {toFa(list.length)} کاربر از {toFa(users.length)}
            </p>
            {/* A list, and marked as one: these rows are a set of peers rather
                than sections of a document, and a screen reader announcing
                «فهرست، ۹ مورد» is what tells somebody how long it is before they
                start down it. */}
            <ul className="list-none p-0 m-0 flex flex-col gap-s5 mt-s5">
              {list.map((u) => <UserRow key={u.id} user={u} />)}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * One account's row.
 *
 * Its own component taking the whole `user`, deliberately: every field below is
 * read off the one object the row was handed, so there is no second collection
 * to index into and no way for this row to draw the next row's role. `key` is
 * the account id and never the position — a filtered list re-keyed by index
 * reuses the element that held somebody else.
 */
function UserRow({ user }: { user: AdminUser }) {
  return (
    <li>
      <Link to={`/users/${user.id}`} className="block no-underline">
        <Card className="px-s9 py-s8 hover:shadow-card-hover transition">
          <div className="flex items-center gap-s6 flex-wrap">
            <span className="text-subtitle font-bold text-ink">{user.displayName}</span>
            <StatusPill tone={user.disabled ? 'neutral' : 'ok'}
              label={user.disabled ? 'غیرفعال' : 'فعال'} />
            {/* The number is a latin-digit run inside RTL prose. Pinned `ltr` so
                a spelling that is not digits alone stays in the order it was
                stored in. */}
            <span dir="ltr" className="text-caption text-muted font-mono">{user.username}</span>
          </div>
          <div className="flex items-center gap-s6 flex-wrap mt-s4">
            <span className="text-caption text-violet font-bold">{user.role ?? '—'}</span>
            <span className="text-caption text-muted">
              {user.supervisor
                ? `سرپرست: ${user.supervisor.displayName}`
                : 'بدون سرپرست'}
            </span>
          </div>
          {user.supervisor?.disabled && (
            // D14 does not repoint subordinates when a supervisor is disabled —
            // the gap is surfaced instead — so this is the only place anybody
            // learns that this person's comment approval routes to an account
            // that can no longer sign in.
            <p className="text-caption text-warn font-bold mt-s4">{SUPERVISOR_GONE}</p>
          )}
        </Card>
      </Link>
    </li>
  )
}
