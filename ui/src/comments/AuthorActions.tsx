import { useState } from 'react'
import { useEditComment, useWithdrawComment, type Comment } from '../api/comments'
import { ApiError } from '../api/client'
import { useToast } from '../write/ToastProvider'
import { DecisionModal } from './DecisionModal'

/** The draft's placeholder (Reader L761), on both surfaces. */
export const DRAFT_HINT = 'حرفتان را ساده بنویسید…'

/** Each inbox draws the row at its own design's metrics; the behaviour is this file's. */
export interface AuthorLook { row: string; ghost: string; danger: string; send: string; cancel: string }

/**
 * The author's own controls, Reader L786–820 — on the Reader card and in the
 * Panel's detail alike, since every author controls their comment until someone
 * else acts on it (D36 as amended by the 2026-09-29 addendum, decision B).
 * «عوض کردن متن» opens a draft the caller draws in place of the text (Reader
 * L761): `draft` is that text, null while nobody is editing.
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
  const [asking, setAsking] = useState(false)
  const busy = edit.isPending || withdraw.isPending
  const fail = (e: unknown) => toast.show((e instanceof ApiError && e.detail) || 'انجام نشد')
  const done = (msg: string) => () => { toast.show(msg); onDraft(null); setAsking(false) }

  function save() {
    const text = draft?.trim()
    if (!text) { toast.show('متن خالی است'); return }
    edit.mutate({ ref: c.id, text }, { onSuccess: done('اصلاح شد و زنجیره از اول شروع شد'), onError: fail })
  }

  if (!c.actions.edit && !c.actions.withdraw) return null
  return (
    <>
      {draft !== null ? (
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
