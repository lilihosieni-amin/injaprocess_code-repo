import { useId, type ReactNode } from 'react'
import { roleLabel } from '../lib/roles'
import { Checkbox } from '../ui/Checkbox'
import { Dropdown } from '../ui/Dropdown'
import { PasswordField } from '../ui/PasswordField'
import { TextField } from '../ui/TextField'
import { ScopePicker } from './ScopePicker'
import { SupervisorPicker } from './SupervisorPicker'
import type { Role, SupervisorCandidate } from '../api/users'
import type { UserDraft } from '../lib/userDraft'

/** D15 has no delivery channel of its own — ledger L-37 is the owner's ruling
 *  that there is no reset-link route to build one on. The administrator chooses
 *  the value and tells the person, so they have to know that is the arrangement
 *  before they invent one nobody can be told. */
export const PASSWORD_NOTE =
  'این گذرواژه را خودتان به این شخص می‌گویید؛ پیوند بازیابی‌ای در کار نیست.'

/** D51 — an org-chart fact and not a capability, in §6.8's own words. */
export const CAN_SUPERVISE_NOTE =
  'این پرچم هیچ دسترسی نمی‌دهد؛ فقط او را در فهرست سرپرست‌های قابل انتخاب می‌آورد.'

/**
 * One §6.14 section: a tinted sub-panel at 16px with a caption that is also its
 * accessible name.
 *
 * `role="group"` rather than `<section aria-labelledby>`, and not
 * `src/ui/SectionCard.tsx`, for the two reasons `src/screens/UserDetail.tsx`
 * gives beside its own `Panel`: an accessibly-named `<section>` is a landmark
 * `region`, and two landmarks inside a modal is a screen reader announcing
 * furniture; and `SectionCard` forwards nothing but its four props, so no
 * `aria-label` can reach the DOM through it. The three local copies of this box
 * reconcile in one commit by whoever owns all three.
 */
function Section({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={caption}
      className="border rounded-card p-s8 bg-surface-sub border-border-current">
      <p className="m-0 mb-s6 text-fs-xxs font-bold text-muted">{caption}</p>
      {children}
    </div>
  )
}

/**
 * The five things an account is, drawn once for both dialogs (D13, D51, D57).
 *
 * Creating a user and editing one differ in what they *send* — a whole account
 * against the fields that moved — and in nothing an administrator looks at, so
 * one set of fields rather than two that would come to disagree about what a
 * scope is called or which roles may be offered.
 *
 * §6.14 composes the whole dialog out of two captioned sub-panels, and that is
 * the entire layout: the eyebrow is what tells an administrator which question
 * they are answering.
 *
 * `roles` and `candidates` arrive as props and are rendered whole. Both lists
 * are already the server's answer to a question about permission: `/api/roles`
 * is filtered by the rule that would refuse the write (D56), and the candidate
 * list is `eligible_supervisors` itself. Re-deriving either here would be a
 * second copy of a rule, and the copy is the one that gets it wrong.
 *
 * **There is no role editor here and there cannot be one** (FR-A5 / AC-16). The
 * roles are fixed: none may be created, renamed or removed from inside the
 * system, by anybody, the editor included. Only users are created. This dropdown
 * chooses among the roles the server offered and has no other affordance.
 */
export function UserFields({
  draft, onChange, roles, candidates, candidatesPending, supervisorStaysPut,
  preferred, password,
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
  /** The initial password, on the create form only. Setting somebody else's
   *  afterwards is its own endpoint, its own event and its own revocation rule
   *  (D15), and it is on the record rather than in the edit dialog. */
  password?: { value: string; onChange: (next: string) => void }
}) {
  const nameId = useId()
  const numberId = useId()
  const passwordId = useId()

  return (
    <>
      {/* §6.14 section 1. */}
      <Section caption="هویت و ورود">
        <div data-testid="two-up" className="grid grid-cols-2 gap-s6 max760:grid-cols-1">
          <TextField id={nameId} label="نام و نام خانوادگی" placeholder="مثلاً سحر بیات"
            ground="card"
            value={draft.displayName}
            onChange={(v) => onChange({ ...draft, displayName: v })} />
          {/* The design's second identity field is an alias (`s.bayat`); ours is
              a mobile number (D57), so the label and the placeholder are this
              app's and the shape is the design's. `ltr` because it is a latin
              digit run inside RTL prose, and no `maxLength`: `normalisePhone`
              accepts nine spellings, five of them longer than a canonical
              number, and truncating one makes a DIFFERENT valid number rather
              than rejecting it — which jsdom, enforcing no cap at all, would
              never show. */}
          <TextField id={numberId} label="شمارهٔ موبایل" placeholder="09123456789"
            ltr type="tel" inputMode="numeric" autoComplete="username" ground="card"
            value={draft.username}
            onChange={(v) => onChange({ ...draft, username: v })} />
        </div>
        {password !== undefined && (
          <div className="mt-s6">
            <PasswordField id={passwordId} label="گذرواژهٔ اولیه"
              value={password.value} onChange={password.onChange}
              autoComplete="new-password" ground="card"
              placeholder="دست‌کم ۶ نویسه"
              hint={PASSWORD_NOTE} />
          </div>
        )}
      </Section>

      {/* §6.14 section 2. */}
      <Section caption="جایگاه در سازمان">
        <Dropdown label="نقش"
          value={draft.roleId === null ? undefined : String(draft.roleId)}
          // Every option is a real role, so this is always a number. There is no
          // blank option and no way back to `null` from here: `roleId: null` is
          // a 400 the server calls "a form that lost its value", and R5 forbids
          // drawing a choice the form would refuse. The `null` state exists only
          // on the create form, before anything has been chosen.
          onChange={(v) => onChange({ ...draft, roleId: Number(v) })}
          placeholder="انتخاب کنید"
          // Exactly what the server returned, in the order it returned it — the
          // value is still the id, which is what the request carries.
          // `/api/roles` is already filtered by the rule that would refuse the
          // write (D56); re-deriving it here would be the copy that gets it
          // wrong. Only the wording is this file's: `roleLabel` keeps the
          // identifier for a role seeded ahead of this build rather than
          // offering a blank nobody can choose deliberately.
          options={roles.map((r) => ({ value: String(r.id), label: roleLabel(r.name) }))} />

        <div className="mt-s6 flex flex-col gap-s6">
          <ScopePicker scopes={draft.scopes} onChange={(next) =>
            onChange({ ...draft, scopes: next })} />
          <SupervisorPicker
            candidates={candidates} value={draft.supervisorId}
            onChange={(id) => onChange({ ...draft, supervisorId: id })}
            // D51 — "no supervisor" is a state only a `*`-scoped account may be in.
            allowNone={draft.scopes.includes('*')}
            staysPut={supervisorStaysPut} preferred={preferred}
            pending={candidatesPending} />
          <Checkbox checked={draft.canSupervise}
            onChange={(v) => onChange({ ...draft, canSupervise: v })}
            label="سرپرست‌شدن"
            hint={CAN_SUPERVISE_NOTE} />
        </div>
      </Section>
    </>
  )
}
