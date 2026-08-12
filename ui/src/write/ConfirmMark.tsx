import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { useSetConfirmation, useRevokeConfirmation } from '../api/hooks'
import { ApiError } from '../api/client'
import { jalali, toFa } from '../lib/format'
import { StatusPill } from '../ui/StatusPill'
import { Button } from '../ui/Button'
import type { Confirmation } from '../api/types'

/** What a 409 means, in the words it means it in.
 *
 *  Not a failure and not phrased as one. The request was well formed, the
 *  caller is permitted, and the server's answer is that the document moved
 *  under them since they read it — so the instruction is *look again*, never
 *  *try again*, which would send the editor back at the very bytes that were
 *  refused. Written here rather than echoed from the response body so the
 *  distinction is this component's and can be tested as this component's. */
const MOVED = 'این محتوا از زمانی که آن را دیدید تغییر کرده است؛ دوباره بررسی کنید.'
/** Everything else: a 5xx, a dropped connection, a body that would not parse. */
const FAILED = 'انجام نشد؛ دوباره تلاش کنید.'

/**
 * Whether an Editor has vouched for this exact document, and the two acts that
 * change it (spec D20, D61).
 *
 * **Drawn for nobody but a holder of `confirm` on this department.** Not a
 * disabled button and not a greyed mark: a non-editor is only ever served
 * content that *is* confirmed (D22), so a mark would state something true of
 * everything they can see and therefore say nothing at all. Cosmetic either way
 * — the endpoints re-derive the capability and refuse regardless (D48).
 *
 * **The fingerprint comes from the server and goes straight back.** The client
 * computes none: canonical JSON here would have to agree with Python's byte for
 * byte over Persian text, and the definition of a confirmation would then live
 * in two languages. Echoing it is also what makes a stale screen fail loudly —
 * the POST answers 409 when the document moved, rather than marking bytes
 * nobody read as reviewed.
 *
 * `row.confirmed` is therefore "the stored mark is for *these* bytes", not "a
 * mark exists": a document edited after being confirmed arrives false, which is
 * the whole reason a fingerprint is stored instead of a boolean.
 */
export function ConfirmMark({ row, department }:
  { row: Confirmation | undefined; department: string }) {
  const can = useCan(useSession().data)
  const set = useSetConfirmation(department)
  const revoke = useRevokeConfirmation(department)
  // Hooks first, then the early return: an early return above them would change
  // hook order between renders the moment the row arrives.
  if (!row || !can('confirm', `dept:${department}`)) return null

  const failure = set.error ?? revoke.error
  const moved = failure instanceof ApiError && failure.status === 409
  // Both, and both non-null: `_row` only fills the pair when the stored
  // fingerprint still matches, so on an unconfirmed row they are null and
  // «توسط null · NaN/NaN/NaN» is what an unguarded line would print.
  const by = row.confirmed_by
  const at = row.confirmed_at

  return (
    <span className="inline-flex items-center gap-s5">
      <StatusPill tone={row.confirmed ? 'ok' : 'warn'}
        label={row.confirmed ? 'تأیید شده' : 'تأیید نشده'} />
      {row.confirmed ? (
        <Button variant="ghost" onClick={() => revoke.mutate(row.target)}
          loading={revoke.isPending} loadingLabel="در حال لغو…">لغو تأیید</Button>
      ) : (
        <Button variant="green" loading={set.isPending} loadingLabel="در حال تأیید…"
          onClick={() => set.mutate({ target: row.target,
                                      fingerprint: row.fingerprint })}>
          تأیید محتوا
        </Button>
      )}
      {by !== null && typeof at === 'number' && (
        // `at` is unix **seconds** — `int(time.time())` on the server, not the
        // ISO string every other timestamp in this app carries. Handed to
        // `jalali` raw it is read as milliseconds and prints ۱۳۴۸/…, five
        // decades off and perfectly plausible-looking.
        <span className="text-caption text-faint">
          توسط {toFa(by)} · {jalali(new Date(at * 1000).toISOString())}
        </span>
      )}
      {failure && (
        <span role="alert" className="text-caption text-conflict">
          {moved ? MOVED : FAILED}
        </span>
      )}
    </span>
  )
}
