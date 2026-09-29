import { useState } from 'react'
import { useEditComment, useRestoreComment, useWithdrawComment, type Comment } from '../api/comments'
import { ApiError } from '../api/client'
import { EDITED, EDITED_RESTARTED, RESEND, RESENT } from '../lib/comments'
import { useToast } from '../write/ToastProvider'
import { DecisionModal } from './DecisionModal'

/** The draft's placeholder (Reader L761), on both surfaces. */
export const DRAFT_HINT = 'حرفتان را ساده بنویسید…'

/**
 * Whether the draft is drawn: opened, and still the author's to save. A refetch
 * can take `edit` away mid-draft (an Editor addresses the comment, a supervisor
 * approves it); the text then comes back rather than a box nothing can save.
 */
export const drafting = (c: Comment, draft: string | null): draft is string =>
  draft !== null && c.actions.edit

/** Each inbox draws the row at its own design's metrics; the behaviour is this file's. */
export interface AuthorLook { row: string; ghost: string; danger: string; send: string; cancel: string }

/**
 * The author's own controls, Reader L786–820 — on the Reader card and in the
 * Panel's detail alike, since every author controls their comment until someone
 * else acts on it (D36 as amended by the 2026-09-29 addendum, decision B).
 * «عوض کردن متن» opens a draft the caller draws in place of the text (Reader
 * L761): `draft` is that text, null while nobody is editing. A withdrawn
 * comment offers «ارسال دوباره» instead (decision C), without asking — it is
 * the way back from «پس گرفتن», which did ask.
 */
export function AuthorActions({ c, draft, onDraft, look }: {
  c: Comment
  draft: string | null
  onDraft: (draft: string | null) => void
  look: AuthorLook
}) {
  const toast = useToast()
  const edit = useEditComment()
  const withdraw = useWithdrawComment()
  const restore = useRestoreComment()
  const [asking, setAsking] = useState(false)
  const busy = edit.isPending || withdraw.isPending || restore.isPending
  const fail = (e: unknown) => toast.show((e instanceof ApiError && e.detail) || 'انجام نشد')
  const done = (msg: string) => () => { toast.show(msg); onDraft(null); setAsking(false) }

  function save() {
    const text = draft?.trim()
    if (!text) { toast.show('متن خالی است'); return }
    edit.mutate({ ref: c.id, text }, {
      onSuccess: (r) => done(r.state === 'approved' ? EDITED : EDITED_RESTARTED)(), onError: fail })
  }

  if (c.actions.restore) return (
    <div data-r-cmtactions className={look.row}>
      <button type="button" disabled={busy} className={look.send}
        onClick={() => restore.mutate(c.id, { onSuccess: done(RESENT), onError: fail })}>{RESEND}</button>
    </div>
  )
  if (!c.actions.edit && !c.actions.withdraw) return null
  return (
    <>
      {drafting(c, draft) ? (
        <div data-r-cmtactions className={look.row}>
          <button type="button" onClick={save} disabled={busy} className={look.send}>دوباره بفرست</button>
          <button type="button" onClick={() => onDraft(null)} className={look.cancel}>انصراف</button>
        </div>
      ) : (
        <div data-r-cmtactions className={look.row}>
          {c.actions.edit && (
            <button type="button" onClick={() => onDraft(c.text)} className={look.ghost}>عوض کردن متن</button>
          )}
          {c.actions.withdraw && (
            <button type="button" disabled={busy} className={look.danger} onClick={() => setAsking(true)}>
              پس گرفتن
            </button>
          )}
        </div>
      )}
      {asking && (
        <DecisionModal kind="withdraw" pending={busy} onClose={() => setAsking(false)}
          onConfirm={() => withdraw.mutate(c.id, { onSuccess: done('پس گرفته شد — در سابقه می‌ماند'), onError: fail })} />
      )}
    </>
  )
}
