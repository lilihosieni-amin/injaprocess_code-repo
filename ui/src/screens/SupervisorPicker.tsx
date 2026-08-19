import { useEffect, useMemo, useRef } from 'react'
import { useDepartments } from '../api/hooks'
import { scopesLabel } from '../lib/scopes'
import { Dropdown } from '../ui/Dropdown'
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

/** §6.14's own closing rule statement, plus D51's clause.
 *
 *  The two design sentences are why the list is as short as it is. The third is
 *  this product's and the design has no permission model to state it in: drawn
 *  beside a role picker with no qualification, a supervisor reads as a
 *  permission and would then be chosen to give somebody something. It routes
 *  comment approval (D34) and grants nothing whatever — a Reader may supervise
 *  a Reader. */
export const SUPERVISOR_RULE =
  'سرپرست باید بالاتر از این کاربر باشد و دپارتمانش دپارتمان او را پوشش دهد. '
  + 'خوانندهٔ گزارش نمی‌تواند سرپرست کسی باشد، چون کامنتی را تأیید نمی‌کند. '
  + 'این انتخاب جایگاهی در نمودار سازمانی است و هیچ دسترسی‌ای نمی‌دهد.'

/** §6.14 — what the popover says when the server offered nobody. Distinct from
 *  the search miss below, which is a different fact with different advice. */
export const NO_CANDIDATE = 'برای این نقش سرپرستی در دسترس نیست'
export const NO_SEARCH_HIT = 'سرپرستی با این نام نیست'

/**
 * Who may supervise this account, and **why each of them is on the list** (D52).
 *
 * §6.14 draws a single-select `Dropdown`, and that is not a skin change: forty
 * candidates were forty 49px radio rows — ~1960px — stacked under an
 * already-1300px scope fieldset inside one scrolling dialog (F29). A popover
 * with a `--height-popover` cap and its own search is the same list at a bounded
 * height.
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

  const options = [
    // D51 — "no supervisor" is a state only a `*`-scoped account may be in, so
    // the option exists for exactly those. NFR-12: a choice this account may
    // not make is ABSENT, never drawn and disabled.
    ...(allowNone ? [{ value: '', label: NO_SUPERVISOR }] : []),
    ...candidates.map((c) => ({
      value: String(c.id),
      // D52 — the scope goes beside the name because past thirty users the
      // reason somebody is on this list is otherwise invisible, and picking
      // blindly is how a chain ends up routed somewhere nobody intended.
      label: `${c.displayName} — ${scopesLabel(c.scopes, names)}`,
      note: c.username,
    })),
  ]

  return (
    <div className="flex flex-col gap-s3">
      <Dropdown
        label="سرپرست"
        // `''` is «بدون سرپرست»'s own value, and that option exists only where
        // the state is legal (D51) — so where it is not, `''` matches no option
        // and the trigger stays on its placeholder rather than reading as a
        // choice nobody made. An off-list id lands there the same way, which is
        // what the note below is for. Written without a second `allowNone`
        // branch on purpose: the two spellings paint identically, and a ternary
        // whose arms cannot be told apart is a defect this project has shipped
        // before (ledger L-32).
        value={value === null ? '' : String(value)}
        onChange={(id) => onChange(id === '' ? null : Number(id))}
        placeholder={pending ? 'در حال بارگذاری…' : 'انتخاب کنید'}
        searchable searchPlaceholder="نام یا شماره"
        noHit={NO_SEARCH_HIT}
        empty={NO_CANDIDATE}
        options={options}
      />
      {staysPut && value !== null && !candidates.some((c) => c.id === value) && (
        <p className="text-fs-xs font-semibold text-warn m-0">{SUPERVISOR_OFF_LIST}</p>
      )}
      {/* §6.14's closing rule statement, in its own register: 11.5px, faint,
          lh 1.8. It is the whole answer to "why is this list this short". */}
      <p className="text-fs-xs text-faint leading-sub m-0">{SUPERVISOR_RULE}</p>
    </div>
  )
}
