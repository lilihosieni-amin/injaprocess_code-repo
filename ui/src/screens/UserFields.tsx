import { useId } from 'react'
import { useDepartments } from '../api/hooks'
import { EVERY_DEPARTMENT } from '../lib/scopes'
import { SupervisorPicker } from './SupervisorPicker'
import type { Role, SupervisorCandidate } from '../api/users'
import type { UserDraft } from '../lib/userDraft'

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

  /** `*` and a department are mutually exclusive: `*` already covers every one
   *  of them, so a list holding both says the same thing twice and would be
   *  stored as two rows. */
  function toggleScope(scope: string, on: boolean) {
    if (scope === '*') {
      onChange({ ...draft, scopes: on ? ['*'] : [] })
      return
    }
    const without = draft.scopes.filter((s) => s !== '*' && s !== scope)
    onChange({ ...draft, scopes: on ? [...without, scope] : without })
  }

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
          {/* Exactly what the server returned, in the order it returned it. */}
          {roles.map((r) => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
        </select>
      </div>

      <fieldset className="border-0 p-0 m-0 flex flex-col gap-s4">
        <legend className="text-caption font-bold text-muted p-0">دامنهٔ دسترسی</legend>
        <label className="flex items-center gap-s5 min-h-touch cursor-pointer">
          <input type="checkbox" checked={draft.scopes.includes('*')}
            onChange={(e) => toggleScope('*', e.target.checked)}
            className="w-s8 h-s8 accent-violet" />
          <span className="text-body text-ink">{EVERY_DEPARTMENT}</span>
        </label>
        {(departments ?? []).map((d) => (
          <label key={d.code} className="flex items-center gap-s5 min-h-touch cursor-pointer">
            <input type="checkbox" checked={draft.scopes.includes(`dept:${d.code}`)}
              onChange={(e) => toggleScope(`dept:${d.code}`, e.target.checked)}
              className="w-s8 h-s8 accent-violet" />
            <span className="text-body text-ink">دپارتمان {d.name}</span>
          </label>
        ))}
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
