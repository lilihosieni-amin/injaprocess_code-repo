import { useId } from 'react'
import { useDepartments } from '../api/hooks'
import { roleLabel } from '../lib/roles'
import {
  EVERY_DEPARTMENT, REPORT_KINDS, REPORT_KIND_LABELS, parseScope, reportLabel, scopeLabel,
} from '../lib/scopes'
import { SupervisorPicker } from './SupervisorPicker'
import type { Role, SupervisorCandidate } from '../api/users'
import type { UserDraft } from '../lib/userDraft'

/** What the fieldset says above the boxes, so that «تیک نزدن» is not read as a
 *  third state. The two grants are exclusive per department and the copy has to
 *  say which one wins when both are pressed. */
export const SCOPE_HINT =
  'هر دپارتمان را یا کامل بدهید، یا فقط گزارش‌های مشخصی از آن را. تیک زدن خودِ '
  + 'دپارتمان جای گزارش‌های جداشدهٔ همان دپارتمان را می‌گیرد.'

/** Said only when there is one. A scope this form can draw no control for — a
 *  department that has left the registry, a report kind the server knows and
 *  this build does not, a row the grammar refuses — is **kept** and sent back
 *  unchanged; it must not also be invisible, or the form would report less
 *  access than the account holds. */
export const UNDRAWABLE_SCOPES =
  'این دامنه‌ها را این فرم نمی‌تواند نشان دهد و دست‌نخورده باقی می‌مانند:'

/**
 * The five things an account is, drawn once for both dialogs (D13, D51, D57).
 *
 * Creating a user and editing one differ in what they *send* — a whole account
 * against the fields that moved — and in nothing an administrator looks at, so
 * one set of fields rather than two that would come to disagree about what a
 * scope is called or which roles may be offered.
 *
 * `roles` and `candidates` arrive as props and are rendered whole. Both lists
 * are already the server's answer to a question about permission: `/api/roles`
 * is filtered by the rule that would refuse the write (D56), and the candidate
 * list is `eligible_supervisors` itself. Re-deriving either here would be a
 * second copy of a rule, and the copy is the one that gets it wrong.
 */
export function UserFields({
  draft, onChange, roles, candidates, candidatesPending, supervisorStaysPut,
  preferred,
}: {
  draft: UserDraft
  onChange: (next: UserDraft) => void
  roles: Role[]
  candidates: SupervisorCandidate[]
  candidatesPending: boolean
  /** Whether this save would leave an off-list supervisor untouched — false on
   *  the create form, and false on an edit that moves the edge or the scopes.
   *  Passed straight down; the picker says what it means. */
  supervisorStaysPut: boolean
  /** The username of the person filling the form in, on the create form only. */
  preferred?: string
}) {
  const nameId = useId()
  const numberId = useId()
  const roleId = useId()
  const { data: departments } = useDepartments()

  function setScopes(next: string[]) {
    onChange({ ...draft, scopes: next })
  }

  /** `*` and a department are mutually exclusive: `*` already covers every one
   *  of them, so a list holding both says the same thing twice and would be
   *  stored as two rows. Turning it off leaves nothing behind rather than
   *  restoring whatever was ticked before it — the boxes were cleared when it
   *  went on, and reviving them would grant departments nobody re-read. */
  function toggleEverything(on: boolean) {
    setScopes(on ? ['*'] : [])
  }

  /**
   * The whole department (`dept:{code}`).
   *
   * **Turning it on is the widening act and says so on screen**: it removes
   * `*` (already covered) and every narrowing of this same department, and those
   * report boxes visibly clear under the hand that ticked it. Turning it off
   * removes exactly this one grant and touches nothing else — a subtraction can
   * never be the thing that hands somebody more.
   */
  function toggleDepartment(code: string, on: boolean) {
    const whole = `dept:${code}`
    if (!on) {
      setScopes(draft.scopes.filter((s) => s !== whole))
      return
    }
    const narrower = `${whole}/report:`
    setScopes([
      ...draft.scopes.filter((s) => s !== '*' && s !== whole && !s.startsWith(narrower)),
      whole,
    ])
  }

  /**
   * One report of one department (`dept:{code}/report:{kind}`) — the third shape
   * of the grammar, which every other layer already handles (`scopes.SCOPE_RE`,
   * `may_delegate`, `eligible_supervisors`, `_clean_scopes`) and which this form
   * could neither express nor even *display* until now: a «Report reader» —
   * D11's own deployment table names one — opened with every box blank, read as
   * "no departments at all", and the obvious repair was to tick the department
   * and silently promote them from one report to all of it.
   *
   * Ticking one drops the whole-department grant, because holding both stores
   * the same reach twice and `dept:x` already covers `dept:x/report:k`. Ticking
   * a second kind keeps the first: a narrowing is a *set* of reports.
   */
  function toggleReport(code: string, kind: string, on: boolean) {
    const scope = `dept:${code}/report:${kind}`
    if (!on) {
      setScopes(draft.scopes.filter((s) => s !== scope))
      return
    }
    const whole = `dept:${code}`
    setScopes([
      ...draft.scopes.filter((s) => s !== '*' && s !== whole && s !== scope),
      scope,
    ])
  }

  const names = Object.fromEntries((departments ?? []).map((d) => [d.code, d.name]))
  // Only once the registry has arrived: while `/api/departments` is in flight
  // every department scope is "one this form draws no box for", and the notice
  // would flash on a perfectly ordinary account.
  const undrawable = departments === undefined ? [] : draft.scopes.filter((s) => {
    const parsed = parseScope(s)
    if (parsed.shape === 'every') return false
    if (parsed.shape === 'refused') return true
    if (!(parsed.code in names)) return true
    return parsed.shape === 'report' && reportLabel(parsed.report) === undefined
  })

  return (
    <div className="flex flex-col gap-s8">
      <div className="flex flex-col gap-s2">
        <label htmlFor={nameId} className="text-caption font-bold text-muted">
          نام و نام خانوادگی
        </label>
        <input
          id={nameId}
          type="text"
          value={draft.displayName}
          onChange={(e) => onChange({ ...draft, displayName: e.target.value })}
          className="min-h-touch w-full px-s7 rounded-control border border-line bg-card text-body text-ink"
        />
      </div>

      <div className="flex flex-col gap-s2">
        <label htmlFor={numberId} className="text-caption font-bold text-muted">
          شمارهٔ موبایل
        </label>
        <input
          id={numberId}
          type="tel"
          inputMode="numeric"
          autoComplete="username"
          // The number is a latin-digit run inside RTL prose; pinned `ltr` so
          // what was typed stays in the order it was typed in.
          dir="ltr"
          // No maxLength. `normalisePhone` accepts nine spellings and five of
          // them — «+98 0912 345 6789» and «(0912) 3456789» among them — are
          // longer than a canonical number. Truncating one does not reject it,
          // it makes a DIFFERENT, valid number, and jsdom enforces no cap at all
          // so no runnable test would ever see it.
          value={draft.username}
          onChange={(e) => onChange({ ...draft, username: e.target.value })}
          className="min-h-touch w-full px-s7 rounded-control border border-line bg-card text-body text-ink"
        />
      </div>

      <div className="flex flex-col gap-s2">
        <label htmlFor={roleId} className="text-caption font-bold text-muted">نقش</label>
        <select
          id={roleId}
          value={draft.roleId === null ? '' : String(draft.roleId)}
          onChange={(e) => onChange({
            ...draft,
            roleId: e.target.value === '' ? null : Number(e.target.value),
          })}
          className="min-h-touch w-full px-s7 rounded-control border border-line bg-card text-body text-ink"
        >
          <option value="">انتخاب کنید</option>
          {/* Exactly what the server returned, in the order it returned it —
              **the value is still the id**, which is what the request carries.
              Only the wording is this file's: `roleLabel` keeps the identifier
              for a role seeded ahead of this build rather than offering a blank
              option nobody can choose deliberately. */}
          {roles.map((r) => (
            <option key={r.id} value={String(r.id)}>{roleLabel(r.name)}</option>
          ))}
        </select>
      </div>

      <fieldset className="border-0 p-0 m-0 flex flex-col gap-s4">
        <legend className="text-caption font-bold text-muted p-0">دامنهٔ دسترسی</legend>
        <p className="text-caption text-faint m-0">{SCOPE_HINT}</p>
        <label className="flex items-center gap-s5 min-h-touch cursor-pointer">
          <input type="checkbox" checked={draft.scopes.includes('*')}
            onChange={(e) => toggleEverything(e.target.checked)}
            className="w-s8 h-s8 accent-violet" />
          <span className="text-body text-ink">{EVERY_DEPARTMENT}</span>
        </label>
        {(departments ?? []).map((d) => (
          <div key={d.code}
            className="flex flex-col gap-s1 border border-line rounded-control px-s6 py-s3">
            <label className="flex items-center gap-s5 min-h-touch cursor-pointer">
              <input type="checkbox" checked={draft.scopes.includes(`dept:${d.code}`)}
                onChange={(e) => toggleDepartment(d.code, e.target.checked)}
                className="w-s8 h-s8 accent-violet" />
              <span className="text-body text-ink">دپارتمان {d.name}</span>
            </label>
            {/* Drawn for every department, always — not revealed by ticking the
                department first. Hidden until then, an account that already
                holds one report would open with its own grant nowhere on the
                page, which is the defect this control exists to end. */}
            <div className="flex flex-col ps-s10">
              {REPORT_KINDS.map((kind) => (
                <label key={kind} className="flex items-center gap-s5 min-h-touch cursor-pointer">
                  {/* `aria-label`, because the visible text is «فقط …» and the
                      same two kinds appear under every department: without it,
                      nine departments give this page nine controls with one
                      accessible name, and neither a screen reader nor a test can
                      say which department a «فقط راهنمای گام‌به‌گام» belongs to. */}
                  <input
                    type="checkbox"
                    aria-label={`دپارتمان ${d.name} — فقط ${REPORT_KIND_LABELS[kind]}`}
                    checked={draft.scopes.includes(`dept:${d.code}/report:${kind}`)}
                    onChange={(e) => toggleReport(d.code, kind, e.target.checked)}
                    className="w-s8 h-s8 accent-violet" />
                  <span className="text-caption text-muted">فقط {REPORT_KIND_LABELS[kind]}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
        {undrawable.length > 0 && (
          <p className="text-caption text-warn font-bold m-0">
            {UNDRAWABLE_SCOPES} {undrawable.map((s) => scopeLabel(s, names)).join('، ')}
          </p>
        )}
      </fieldset>

      <label className="flex items-center gap-s5 min-h-touch cursor-pointer">
        <input type="checkbox" checked={draft.canSupervise}
          onChange={(e) => onChange({ ...draft, canSupervise: e.target.checked })}
          className="w-s8 h-s8 accent-violet" />
        <span className="text-body text-ink">می‌تواند سرپرست دیگران باشد</span>
      </label>

      <SupervisorPicker
        candidates={candidates}
        value={draft.supervisorId}
        onChange={(id) => onChange({ ...draft, supervisorId: id })}
        // D51 — "no supervisor" is a state only a `*`-scoped account may be in.
        allowNone={draft.scopes.includes('*')}
        staysPut={supervisorStaysPut}
        preferred={preferred}
        pending={candidatesPending}
      />
    </div>
  )
}
