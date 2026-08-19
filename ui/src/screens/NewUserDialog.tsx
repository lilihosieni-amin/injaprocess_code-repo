import { useId, useState, type FormEvent } from 'react'
import { useSession } from '../auth/useSession'
import { useDepartments } from '../api/hooks'
import { useCreateUser, useRoles, useSupervisorCandidates } from '../api/users'
import { normalisePhone } from '../lib/digits'
import { refusalText } from '../lib/refusal'
import { draftProblem, readFailure, type UserDraft } from '../lib/userDraft'
import { UserDialogShell } from './UserDialogShell'
import { UserFields } from './UserFields'

const BLANK: UserDraft = {
  displayName: '', username: '', roleId: null, scopes: [],
  canSupervise: false, supervisorId: null,
}

/**
 * Creating an account (D13, D15, D51, D57, D58).
 *
 * **Mounted only while it is open**, which is what makes the roles and the
 * candidate list unasked-for until somebody wants them — three requests per page
 * view for a dialog nobody opened, and the candidate list would be an answer
 * about scopes that do not exist yet. It is also what makes a second opening
 * start blank rather than on the last attempt's half-filled form.
 *
 * Every refusal answered here is one the server would answer anyway: the point
 * is *when*. `POST /api/users` computes a ~61 ms argon2 hash on the shared
 * verify limiter before it can say the password is five characters long, and a
 * mistyped number costs the same. Nothing about permission is re-decided —
 * `/api/roles` has already said which roles this actor may confer and the
 * candidate list is `eligible_supervisors` itself.
 *
 * The dialog stays open on a refusal. Its sentence is the server's own, and
 * closing would throw away everything that was typed in front of it.
 */
export function NewUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession().data
  const passwordId = useId()
  const [draft, setDraft] = useState<UserDraft>(BLANK)
  const [password, setPassword] = useState('')
  const [problem, setProblem] = useState<string | undefined>(undefined)
  const roles = useRoles()
  // The registry the scope fieldset is drawn from, asked for here as well as
  // inside `UserFields` so that a failure has somewhere to be reported. Same
  // query key, so react-query answers both from one request.
  const departments = useDepartments()
  // `undefined`, not the id of anybody: on this form the account does not exist
  // yet, so there is nobody to leave out (`eligible_supervisors`' `excluding`).
  const candidates = useSupervisorCandidates(draft.scopes, undefined)
  const create = useCreateUser()

  function submit(e: FormEvent) {
    e.preventDefault()
    // Both complaints reset on every attempt: one left over from the last try
    // sits under the one now in flight and reads as a fresh rejection of a
    // value that was fine.
    create.reset()
    const roleId = draft.roleId
    const found = draftProblem(draft, {
      password,
      // `undefined`, not `[]`, while the list is in flight: an empty list means
      // "nobody is eligible" and would refuse — with no request at all — a
      // supervisor the server would accept (D48).
      eligibleIds: candidates.data?.map((c) => c.id),
      // Always: this form sends the supervisor *and* the scopes on every
      // request, so there is no "unchanged edge" for it to leave alone.
      supervisorMoved: true,
    })
    setProblem(found)
    if (found !== undefined || roleId === null) return
    create.mutate({
      username: normalisePhone(draft.username),
      displayName: draft.displayName.trim(),
      password,
      roleId,
      scopes: draft.scopes,
      supervisorId: draft.supervisorId,
      canSupervise: draft.canSupervise,
    }, { onSuccess: () => onClose() })
  }

  const alert = problem ?? (create.error ? refusalText(create.error) : undefined)

  // After every hook and before the form: this dialog is three lists and the
  // fields that consume them, and a list that did not arrive is not an empty
  // one. Drawn anyway, the form makes three false claims — no role may be
  // chosen, this installation has no departments to grant, and nobody in it may
  // supervise this account — and refuses every submit with a sentence about a
  // field the administrator did fill in.
  const failed = readFailure(roles, departments, candidates)

  return (
    <UserDialogShell
      open={open} onClose={onClose} title="کاربر جدید" submitLabel="ایجاد کاربر"
      submitting={create.isPending} alert={alert}
      failure={failed}
      onRetry={() => {
        // All three, whichever one failed: a query in `error` refetches on
        // nothing but being asked, so retrying only the two that were already
        // fine would leave the same screen on the press.
        void roles.refetch(); void departments.refetch(); void candidates.refetch()
      }}
      onSubmit={submit}
    >
      <UserFields
        draft={draft} onChange={setDraft}
        roles={roles.data ?? []}
        candidates={candidates.data ?? []}
        candidatesPending={candidates.isPending}
        // There is no account yet, so there is no supervisor to stay put: a
        // choice that has dropped off the list here is simply refused on
        // submit, and «تا وقتی تغییرش ندهید همان‌جا می‌ماند» would be a
        // sentence about an account that does not exist.
        supervisorStaysPut={false}
        preferred={session?.username}
      />

      <div className="flex flex-col gap-s2">
        <label htmlFor={passwordId} className="text-caption font-bold text-muted">
          گذرواژه
        </label>
        <input
          id={passwordId}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-touch w-full px-s7 rounded-control border border-line bg-card text-body text-ink"
        />
        {/* D15 has no delivery channel of its own: the administrator chooses
            the value and tells the person, so they have to know that is the
            arrangement before they invent one nobody can be told. */}
        <p className="text-caption text-faint m-0">
          این گذرواژه را خودتان به این شخص می‌گویید؛ پیوند بازیابی‌ای در کار نیست.
        </p>
      </div>
    </UserDialogShell>
  )
}
