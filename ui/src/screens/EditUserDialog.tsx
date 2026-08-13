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
 * requirement — though not for the reason it looks like. The server's supervisor
 * re-validation triggers on a *changed* value, not a present field
 * (`supervisor_id != target["supervisor_id"] or scopes != before_scopes`), so a
 * body restating an unchanged disabled supervisor would be accepted; what keeps
 * D14's promise here is this form's own `supervisorMoved` gate below. What a
 * full-record body would really cost is `_clean_scopes`: a present `scopes`
 * field is validated entry by entry and 400s on anything the grammar refuses,
 * and `user_scopes.scope` is `TEXT NOT NULL` with no CHECK, so an account
 * holding a refused scope row could not have its display name corrected until
 * those rows were mended. `PATCH` reads `model_fields_set`, so an absent field
 * really is "leave it alone", and the field nobody edited is never asked about.
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

  // Taken here rather than inside `submit` because the note the picker draws
  // depends on it too: "this supervisor stays put" is only true of a save that
  // sends neither the edge nor the scopes.
  const patch = draftPatch(draft, was)
  // The server's own trigger, restated: it re-judges the edge when the
  // supervisor moved **or** when the scopes did, since an eligibility that held
  // for one department says nothing about two. Asked on the supervisor alone,
  // this check would let a widened scope list through and spend the round trip
  // it exists to save. A display-name correction still moves neither field, so
  // D14's unchanged — possibly disabled — supervisor is left alone as before.
  const supervisorMoved = 'supervisorId' in patch || 'scopes' in patch

  function submit(e: FormEvent) {
    e.preventDefault()
    modify.reset()
    const found = draftProblem(draft, {
      // `undefined`, not `[]`, while the list is in flight: an empty list means
      // "nobody is eligible" and would refuse — with no request at all — a
      // supervisor the server would accept (D48).
      eligibleIds: candidates.data?.map((c) => c.id),
      supervisorMoved,
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
          // Only a save that touches neither the edge nor the scopes leaves an
          // off-list supervisor where they are; anything else is re-judged, here
          // and on the server.
          supervisorStaysPut={!supervisorMoved}
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
