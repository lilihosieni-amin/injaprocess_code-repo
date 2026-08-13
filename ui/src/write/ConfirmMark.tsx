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
/** What a 403 means — settled too, and for the same reason not phrased as a retry.
 *
 *  Two things answer 403 on these routes and the status cannot tell them apart:
 *  the target is tombstoned and may no longer be vouched for
 *  (`routers/confirmations.set_confirmation`), or the caller's role has stopped
 *  holding `confirm` (`access.requires`). Both are the server's settled answer
 *  about a control that should not be on this screen at all, and pressing the
 *  same button again cannot change either — «دوباره تلاش کنید» is therefore the
 *  wrong instruction, the very mistake the 409 branch exists to avoid.
 *
 *  Deliberately does not name the tombstone. Echoing the server's own sentence
 *  would tell an editor their process was deleted when in fact their permissions
 *  moved; reloading is the one act that is right for both. */
const GONE = 'این مورد دیگر قابل تأیید نیست؛ صفحه را تازه کنید.'
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
  const status = failure instanceof ApiError ? failure.status : 0
  const moved = status === 409
  // **The alert goes when the condition does.** A 409 is a statement about one
  // fingerprint, not about the button: `useSetConfirmation`'s `onSettled`
  // refetches the listing, so a row carrying a *fresh* fingerprint arrives
  // moments later and the complaint stops being true. Left alone it sat beside
  // an up-to-date row telling the editor to look again at something they were
  // now looking at, cleared only by the next click. `set.variables` is what was
  // submitted, so this compares the refused fingerprint against the one on
  // screen and says nothing once they differ.
  const outlived = moved && set.variables !== undefined
    && set.variables.fingerprint !== row.fingerprint
  // Both, and both non-null: `_row` only fills the pair when the stored
  // fingerprint still matches, so on an unconfirmed row they are null and
  // «توسط null · NaN/NaN/NaN» is what an unguarded line would print.
  const by = row.confirmed_by
  const at = row.confirmed_at

  return (
    <span className="inline-flex items-center gap-s5">
      <StatusPill tone={row.confirmed ? 'ok' : 'warn'}
        label={row.confirmed ? 'تأیید شده' : 'تأیید نشده'} />
      {/* `Button`'s BASE carries no horizontal padding and no type size on
          purpose (I5) — the call site owns both — so a bare `<Button>` renders
          as a 44 px touch box with its text jammed against the edges, at
          inherited body size, inside a title line built from 12.5 px chips.
          jsdom measures nothing, so only a browser ever shows it. `text-caption`
          rather than a literal: the type role tracks the shell's density the way
          every other line in these rows does. */}
      {row.confirmed ? (
        <Button variant="ghost" className="px-3 py-1.5 text-caption"
          onClick={() => revoke.mutate(row.target)}
          loading={revoke.isPending} loadingLabel="در حال لغو…">لغو تأیید</Button>
      ) : (
        <Button variant="green" className="px-3 py-1.5 text-caption"
          loading={set.isPending} loadingLabel="در حال تأیید…"
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
      {failure && !outlived && (
        // role="alert" and not a bare span: this text appears after the click
        // that caused it, so a screen reader is elsewhere on the page when it
        // arrives and would never be told. jsdom implements no live region, so
        // nothing here is observable in a test except the attribute itself —
        // which is why the tests assert the role rather than the words.
        <span role="alert" className="text-caption text-conflict">
          {moved ? MOVED : status === 403 ? GONE : FAILED}
        </span>
      )}
    </span>
  )
}
