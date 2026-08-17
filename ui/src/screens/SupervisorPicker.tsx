import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useDepartments } from '../api/hooks'
import { toLatinDigits } from '../lib/digits'
import { scopesLabel } from '../lib/scopes'
import { SearchField } from '../ui/SearchField'
import { LoadingState } from '../ui/states'
import type { SupervisorCandidate } from '../api/users'

/** What a `*`-scoped account may be given instead of a supervisor (D51). */
export const NO_SUPERVISOR = 'بدون سرپرست'

/** D14 leaves a disabled supervisor in place rather than repointing the people
 *  under them, so an edit form really does open on somebody the picker cannot
 *  offer. Drawn as "nothing chosen" that reads as "this user has no supervisor",
 *  and the administrator's next save would be the one that makes it true.
 *
 *  **Its promise is conditional and so is the note** — see `staysPut`. */
export const SUPERVISOR_OFF_LIST =
  'سرپرست کنونی در این فهرست نیست؛ تا وقتی تغییرش ندهید همان‌جا می‌ماند.'

/**
 * Who may supervise this account, and **why each of them is on the list** (D52).
 *
 * Presentational, and entirely: the rows are the server's answer to
 * `eligible_supervisors` handed down as a prop, so this component adds nobody,
 * removes nobody and re-orders nobody. That matters more than it looks. The
 * rule — active, covering every one of the account's scopes, and either flagged
 * `can_supervise` or scoped `*` — is decided from rows a picker has never read
 * (`disabled_at`, `user_scopes`), and the multi-scope case is the one the spec
 * singles out: a user holding `dept:dining` *and* `dept:cashier` can be
 * supervised only by a `*` holder, because no single department scope covers
 * both. A picker that filtered `/api/users` on `canSupervise` would offer a
 * disabled account and half the wrong departments, and every choice would come
 * back `not_eligible`.
 *
 * **The scope goes beside the name** because past thirty users the reason
 * somebody appears here is otherwise invisible — «سحر بیات — سالن», «کیوان
 * مرادی — همهٔ دپارتمان‌ها» — and picking blindly is how a chain ends up routed
 * somewhere nobody intended.
 *
 * The order is the server's, by `username`, and nothing here re-sorts: an
 * unordered list moves a picker's first entry between two identical requests.
 *
 * `preferred` is the username of the person creating the account, and it is
 * applied **once**, only while nothing is chosen, and only if the server
 * offered them. A default of `candidates[0]` — or of "the creator if present,
 * else the first row" — proposes somebody the administrator never chose, and
 * the org chart is the one thing on this form nobody re-reads afterwards.
 */
export function SupervisorPicker({
  candidates, value, onChange, allowNone, staysPut, preferred, pending,
}: {
  candidates: SupervisorCandidate[]
  value: number | null
  onChange: (id: number | null) => void
  /** D51 — "no supervisor" is legal for a `*`-scoped account and for nobody
   *  else, so the choice is offered to exactly those. */
  allowNone: boolean
  /**
   * Whether an off-list `value` really would be left where it is by the save
   * this form is about to make — **which is the whole content of
   * `SUPERVISOR_OFF_LIST`**, and is true in exactly one case: an existing
   * account whose supervisor and whose scopes are both unchanged (D14).
   *
   * It is false on the create form, where there is no account and nothing stays
   * anywhere, and false on an edit that moves the scopes, where the edge is
   * re-judged against the new ones and this save is refused rather than left
   * alone. Drawn there, the sentence promises the opposite of what happens.
   */
  staysPut: boolean
  preferred?: string
  pending: boolean
}) {
  const group = useId()
  const [q, setQ] = useState('')
  const defaulted = useRef(false)
  const { data: departments } = useDepartments()
  const names = useMemo(
    () => Object.fromEntries((departments ?? []).map((d) => [d.code, d.name])),
    [departments])

  useEffect(() => {
    // Never over a choice already made, and never twice: the second condition
    // is what keeps a default from reappearing after somebody cleared it.
    if (defaulted.current || preferred === undefined || value !== null) return
    const mine = candidates.find((c) => c.username === preferred)
    if (mine === undefined) return
    defaulted.current = true
    onChange(mine.id)
  }, [candidates, preferred, value, onChange])

  const query = q.trim()
  const digits = toLatinDigits(query)
  // Over the name and over the number **as it is stored**: ordinary Persian
  // keyboards emit ۰۹…, the stored username is ASCII (D57), and an unfolded
  // query matches nothing while looking exactly like "this person cannot
  // supervise".
  const shown = candidates.filter((c) =>
    query === '' || c.displayName.includes(query) || c.username.includes(digits))

  return (
    <fieldset className="border-0 p-0 m-0 flex flex-col gap-s5">
      <legend className="text-caption font-bold text-muted p-0">سرپرست</legend>
      {/* D51 — an org-chart fact, not a capability. It routes comment approval
          (D34) and grants nothing whatever: a Reader may supervise a Reader.
          Drawn beside a role picker with no qualification it reads as a
          permission, and would then be chosen to give somebody something. */}
      <p className="text-caption text-faint m-0">
        سرپرست جایگاهی در نمودار سازمانی است، تأیید نظرها را مسیر می‌دهد و هیچ
        دسترسی‌ای نمی‌دهد.
      </p>

      <SearchField label="جست‌وجوی سرپرست" value={q} onChange={setQ}
        placeholder="نام یا شماره" />

      {staysPut && value !== null && !candidates.some((c) => c.id === value) && (
        <p className="text-caption text-warn font-bold m-0">{SUPERVISOR_OFF_LIST}</p>
      )}

      {pending ? (
        <LoadingState rows={2} />
      ) : candidates.length === 0 ? (
        <p className="text-caption text-muted m-0">
          کسی نمی‌تواند سرپرست این کاربر باشد؛ دامنهٔ دسترسی را کم‌تر کنید یا
          سرپرستی یکی از کاربران را فعال کنید.
        </p>
      ) : (
        <ul className="list-none p-0 m-0 flex flex-col gap-s2">
          {allowNone && (
            <li>
              <label className="flex items-center gap-s5 min-h-touch cursor-pointer">
                <input type="radio" name={group} checked={value === null}
                  onChange={() => onChange(null)}
                  className="w-s8 h-s8 accent-violet" />
                <span className="text-body text-ink">{NO_SUPERVISOR}</span>
              </label>
            </li>
          )}
          {shown.map((c) => (
            <li key={c.id}>
              <label className="flex items-start gap-s5 min-h-touch cursor-pointer">
                <input type="radio" name={group} checked={value === c.id}
                  onChange={() => onChange(c.id)}
                  className="mt-s4 w-s8 h-s8 accent-violet" />
                <span className="flex flex-col gap-s1">
                  <span className="text-body text-ink">
                    {c.displayName} — {scopesLabel(c.scopes, names)}
                  </span>
                  {/* The number is a latin-digit run inside RTL prose. Pinned
                      `ltr` so a spelling that is not digits alone stays in the
                      order it was stored in. */}
                  <span dir="ltr" className="text-caption text-muted font-mono">{c.username}</span>
                </span>
              </label>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="text-caption text-muted">کسی با این مشخصات پیدا نشد.</li>
          )}
        </ul>
      )}
    </fieldset>
  )
}
