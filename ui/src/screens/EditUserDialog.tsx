import { useState, type FormEvent } from 'react'
import { useModifyUser, useRoles, useSupervisorCandidates } from '../api/users'
import { refusalText } from '../lib/refusal'
import { draftPatch, draftProblem, type UserDraft } from '../lib/userDraft'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Overlay'
import { UserFields } from './UserFields'
import type { AdminUser } from '../api/users'

/** The account as a form holds it. `supervisor` is a brief on the payload and
 *  an id on the wire, and this is where the two meet. */
function draftOf(user: AdminUser): UserDraft {
  return {
    displayName: user.displayName,
    username: user.username,
    roleId: user.roleId,
    scopes: user.scopes,
    canSupervise: user.canSupervise,
    supervisorId: user.supervisor?.id ?? null,
  }
}

/**
 * Changing an existing account (D13, D14, D51, D57).
 *
 * **It sends the fields that moved and no others**, which is not a saving but a
 * requirement: the server re-validates the supervisor edge whenever the
 * supervisor or the scopes are part of the request, and D14 leaves a supervisor
 * who has since been disabled exactly where they are. A body restating every
 * field would therefore make it impossible to correct somebody's display name
 * until their supervisor had been replaced — and `PATCH` reads
 * `model_fields_set`, so an absent field really is "leave it alone".
 *
 * The account as it stood when the dialog opened is frozen in `was` and is what
 * the diff is taken against. Re-reading it from the query would let a refetch
 * land mid-edit and silently turn a field the administrator changed back into
 * "unchanged".
 *
 * There is no password here. Setting somebody else's is its own endpoint, its
 * own event and its own revocation rule (D15), and it is on the record behind
 * this dialog.
 */
export function EditUserDialog({ user, open, onClose }: {
  user: AdminUser
  open: boolean
  onClose: () => void
}) {
  const [was] = useState<UserDraft>(() => draftOf(user))
  const [draft, setDraft] = useState<UserDraft>(was)
  const [problem, setProblem] = useState<string | undefined>(undefined)
  const roles = useRoles()
  // This very account, excluded: nobody may be offered as their own supervisor,
  // and `eligible_supervisors` takes `excluding` as a required keyword so that
  // forgetting it is impossible rather than silent.
  const candidates = useSupervisorCandidates(draft.scopes, user.id)
  const modify = useModifyUser(String(user.id))

  function submit(e: FormEvent) {
    e.preventDefault()
    modify.reset()
    const patch = draftPatch(draft, was)
    const found = draftProblem(draft, {
      eligibleIds: (candidates.data ?? []).map((c) => c.id),
      // Only when the edge is part of this request. An unchanged supervisor —
      // including a disabled one the picker cannot offer — is D14's business
      // and not this form's.
      supervisorMoved: 'supervisorId' in patch,
    })
    setProblem(found)
    if (found !== undefined) return
    // Nothing moved, so there is nothing to send: the server records
    // `user.modified` only when something changed, and a decision nobody made
    // must not appear in the record.
    if (Object.keys(patch).length === 0) { onClose(); return }
    modify.mutate(patch, { onSuccess: () => onClose() })
  }

  const alert = problem ?? (modify.error ? refusalText(modify.error) : undefined)

  return (
    <Dialog open={open} onClose={onClose} title="ویرایش کاربر">
      <form onSubmit={submit} className="flex flex-col gap-s8">
        <UserFields
          draft={draft} onChange={setDraft}
          roles={roles.data ?? []}
          candidates={candidates.data ?? []}
          candidatesPending={candidates.isPending}
        />

        {alert && (
          <p role="alert" className="text-caption text-conflict m-0">{alert}</p>
        )}

        <div className="flex items-center gap-s5 flex-wrap">
          <Button type="submit" variant="violet" className="px-s8 text-caption"
            loading={modify.isPending} loadingLabel="در حال ثبت…">
            ثبت تغییرات
          </Button>
          <Button type="button" variant="ghost" className="px-s8 text-caption"
            onClick={onClose}>
            انصراف
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
