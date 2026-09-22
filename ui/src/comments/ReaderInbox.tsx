import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  useApproveComment, useComment, useEditComment, useInbox, useRejectComment, useWithdrawComment,
  type Comment, type InboxTab,
} from '../api/comments'
import { ApiError } from '../api/client'
import { useSession } from '../auth/useSession'
import { STATUS, ageText, anchorText } from '../lib/comments'
import { toFa } from '../lib/format'
import { Icon } from '../ui/Icon'
import { NavTabTray } from '../ui/NavTabTray'
import { Pager } from '../ui/Pager'
import { TextField } from '../ui/TextField'
import { LoadFailedScreen, ScreenSkeleton } from '../ui/states'
import { useToast } from '../write/ToastProvider'
import { DecisionModal, type Decision } from './DecisionModal'

/** Reader L1999–2001. */
const TABS: { id: InboxTab; label: string }[] = [
  { id: 'waiting', label: 'در انتظار تأیید شما' },
  { id: 'own', label: 'کامنت‌های من' },
  { id: 'all', label: 'همه' },
]
const PER_PAGE = 10

/** Reader L2782–2784. */
const INTRO = {
  approver: 'کامنت افراد شما اول به شما می‌رسد: تأیید کنید تا بالاتر برود، زیرش یادداشت بگذارید، یا با نوشتن دلیل قبول نکنید.',
  author: 'کامنت‌هایی که خودتان ثبت کرده‌اید و وضعیت‌شان در زنجیره.',
}

/**
 * The reader's comments screen, Reader L724–830. Tabs only for an approver
 * (Reader L1999) — anyone a comment can wait on: the flag, something waiting
 * now, or a `*` scope; the server's `actions` decide every button.
 *
 * `?c=CMT-n` (a drawer's «باز کردن در صندوق کامنت‌ها») opens the tab that
 * holds it — «کامنت‌های من» for the viewer's own, else «همه» — and scrolls
 * its card into view once.
 */
export function ReaderInbox() {
  const session = useSession().data
  const approver = !!session && (session.canSupervise || session.pendingApprovals > 0 || !!session.scopes?.includes('*'))
  const cref = useSearchParams()[0].get('c')
  const { data: target } = useComment(cref ?? '', !!cref)
  const [picked, setPicked] = useState<InboxTab | null>(null)
  const [page, setPage] = useState(1)
  // Reader `cmtOpen` (4528a04): one id, so opening a card closes the other.
  const [openId, setOpenId] = useState<string | null>(null)
  const tab: InboxTab = picked ?? (target ? (target.author.isMe ? 'own' : 'all') : 'waiting')
  const shown: InboxTab = approver ? tab : 'own'
  const { data, error, refetch } = useInbox(shown, shown === 'all' ? page : 1)
  const scrolled = useRef<string | null>(null)
  useEffect(() => {
    if (!cref || scrolled.current === cref) return
    const el = document.getElementById(`cmt-${cref}`)
    if (el) { el.scrollIntoView({ block: 'center' }); scrolled.current = cref }
  }, [cref, data])

  if (error) return <LoadFailedScreen message="کامنت‌ها بارگذاری نشد." error={error} onRetry={() => { void refetch() }} />
  // Only the first load draws a skeleton: `useInbox` keeps the previous page
  // on screen while another tab or page loads.
  if (!data) return <ScreenSkeleton column="reader" />

  const from = (data.page - 1) * PER_PAGE + 1
  return (
    <div data-r-pad className="flex-1 overflow-auto bg-ink pt-screen-y px-reader-x pb-reader-bottom max760:px-s7 max760:py-s9">
      <div className="max-w-reader mx-auto">
        <h1 data-r-title className="font-extrabold text-fs-h1-reader-home max760:text-fs-display-hand text-role-title-on-field m-0">کامنت‌ها</h1>
        <p className="text-fs-body-lead text-role-subtitle-on-field mt-s4 mb-0 leading-sub [text-wrap:pretty]">
          {approver ? INTRO.approver : INTRO.author}
        </p>
        {approver && (
          <NavTabTray halfOnMobile tabs={TABS} value={tab} label="کامنت‌ها" className="mt-s10"
            onChange={(id) => { setPicked(id as InboxTab); setPage(1) }} />
        )}
        <div className="flex flex-col gap-s7 mt-s8">
          {data.items.length === 0 && (
            <div className="bg-card border border-border-card rounded-card py-cmt-empty-y px-empty-x text-center text-muted text-fs-body">
              چیزی اینجا نیست
            </div>
          )}
          {data.items.map((c) => (
            <InboxCard key={c.id} c={c} open={openId === c.id} onToggle={(on) => setOpenId(on ? c.id : null)} />
          ))}
        </div>
        {shown === 'all' && data.pages > 1 && (
          <Pager from={from} to={from + data.items.length - 1} count={data.total}
            page={data.page} pages={data.pages} onPage={setPage} />
        )}
      </div>
    </div>
  )
}

function anchorHref(c: Comment): string {
  return c.anchor.kind === 'department'
    ? `/departments/${encodeURIComponent(c.anchor.department)}/overview`
    : `/processes/${encodeURIComponent(c.anchor.processId ?? '')}/steps${
      c.anchor.kind === 'node' ? `?step=${encodeURIComponent(c.anchor.id)}` : ''}`
}

/** Reader L2719–2721: notes, then the rejection or the editor's closing word. */
function history(c: Comment) {
  return [
    ...c.notes.map((n) => ({ by: `${n.by} اضافه کرد:`, text: n.text, tone: 'border-border-current' })),
    ...(c.state === 'rejected' ? [{ by: 'قبول نشد:', text: c.rejectReason || '—', tone: 'border-border-danger' }] : []),
    ...(c.state === 'addressed'
      ? [{ by: 'ادیتور رسیدگی کرد:', text: c.addressed?.note || 'فرآیند اصلاح شد.', tone: 'border-border-ok' }]
      : []),
  ]
}

/** Reader L2725–2729 — only what the status band does not already say. */
function infoLine(c: Comment): string | null {
  if (c.state === 'approved') return 'رسید به ادیتور.'
  if (c.state !== 'awaiting') return null
  if (c.approvals) return `${toFa(c.approvals)} نفر تأیید کرده‌اند. از اینجا به بعد متن عوض نمی‌شود.`
  return c.author.isMe ? 'تا تأیید نشده می‌توانید متنش را عوض کنید.' : null
}

// Reader L786–820. The design's buttons, drawn at its own metrics.
const ROW = 'flex gap-s5 max760:flex-col max760:gap-s4'
const SUB = 'flex-1 rounded-tile font-bold cursor-pointer max760:w-full max760:flex-none'
const GHOST = `${SUB} border-hairline border-line bg-card text-violet`
const DANGER = `${SUB} p-s7 text-fs-body-lead border-hairline border-border-danger bg-tile-c2 text-danger`
const SOLID = `${SUB} p-button-x text-fs-lg border-0 text-card disabled:opacity-60`
const FIELD = 'text-role-textarea p-s7 rounded-tile leading-loose'
// Reader L750 (4528a04): `padding:3px 9px 3px 7px` — 9 at the inline start.
const PILL = 'inline-flex items-center gap-s2 max-w-full py-hint ps-option pe-button-icon rounded-pill bg-value-current text-fs-micro font-semibold text-muted text-start leading-cmt-pill'

type Mode = null | 'note' | 'reject' | 'edit'

function InboxCard({ c, open, onToggle }: { c: Comment; open: boolean; onToggle: (open: boolean) => void }) {
  const toast = useToast()
  const approve = useApproveComment()
  const reject = useRejectComment()
  const edit = useEditComment()
  const withdraw = useWithdrawComment()
  const [mode, setMode] = useState<Mode>(null)
  const [text, setText] = useState('')
  const [ask, setAsk] = useState<Decision | null>(null)
  const st = STATUS[c.state]
  const notes = history(c)
  const info = infoLine(c)
  const busy = approve.isPending || reject.isPending || edit.isPending || withdraw.isPending
  // Reader L2722–2727 (4528a04): at first glance the anchor and the text; the
  // context sits behind «جزئیات», and any open mode holds the card open.
  const own = c.author.isMe
  const hasMore = notes.length > 0 || !own || (c.state === 'awaiting' && (!!c.approvals || own)) || c.state === 'approved'
  const expanded = open || mode !== null

  const switchTo = (m: Mode, seed = '') => { setMode(mode === m ? null : m); setText(seed) }
  const fail = (e: unknown) => toast.show((e instanceof ApiError && e.detail) || 'انجام نشد')
  const done = (msg: string) => () => { toast.show(msg); setMode(null); setText(''); setAsk(null) }

  function askApprove() {
    if (mode === 'note' && !text.trim()) { toast.show('یادداشتتان را بنویسید'); return }
    setAsk(mode === 'note' ? 'note' : 'approve')
  }
  function askReject() {
    if (mode !== 'reject') { switchTo('reject'); return }
    if (!text.trim()) { toast.show('دلیل رد کردن را بنویسید'); return }
    setAsk('reject')
  }
  function confirm() {
    if (ask === 'withdraw') {
      withdraw.mutate(c.id, { onSuccess: done('پس گرفته شد — در سابقه می‌ماند'), onError: fail })
    } else if (ask === 'reject') {
      reject.mutate({ ref: c.id, reason: text.trim() },
        { onSuccess: done('رد شد و با دلیل به نویسنده برگشت'), onError: fail })
    } else {
      const note = ask === 'note' ? text.trim() : null
      approve.mutate({ ref: c.id, note },
        { onSuccess: done(note ? 'یادداشت شما ثبت و تأیید شد' : 'تأیید شد و بالاتر رفت'), onError: fail })
    }
  }
  function saveEdit() {
    if (!text.trim()) { toast.show('متن خالی است'); return }
    edit.mutate({ ref: c.id, text: text.trim() },
      { onSuccess: done('اصلاح شد و زنجیره از اول شروع شد'), onError: fail })
  }

  // Reader L761 (edit, margin 12), L791/L794 (note/reject, margin 14).
  const area = (placeholder: string, rows: number, danger = false) => (
    <TextField multiline rows={rows} label={placeholder} placeholder={placeholder} value={text} onChange={setText}
      danger={danger} boxClassName={FIELD} className={`${mode === 'edit' ? 'mt-s6' : 'mt-s7'} [&>label]:sr-only`} />
  )

  return (
    <div id={`cmt-${c.id}`} className="bg-card border border-border-card rounded-feature overflow-hidden shadow-card">
      <div className={`flex items-center gap-s5 py-s7 px-s9 ${st.bg}`}>
        <span aria-hidden className={`w-dot h-dot rounded-round flex-none bg-current ${st.fg}`} />
        <span className={`text-fs-body font-bold ${st.fg}`}>{st.label}</span>
        <span className={`ms-auto text-fs-sm2 opacity-75 ${st.fg}`}>{ageText(c.createdAt)}</span>
      </div>

      <div className="p-s9">
        {c.anchor.orphan ? (
          // D31: the anchor no longer stands, so there is nothing to open (as the Panel).
          <span className={PILL}><span className="truncate">{anchorText(c)}</span></span>
        ) : (
          <Link to={anchorHref(c)} className={`${PILL} no-underline cursor-pointer hover:bg-tile-v hover:text-violet`}>
            <span className="truncate">{anchorText(c)}</span>
            <Icon d="M15 18l-6-6 6-6" px={10} stroke={2.6} className="flex-none opacity-70" />
          </Link>
        )}

        {mode === 'edit'
          ? area('حرفتان را ساده بنویسید…', 4)
          : <div className="text-fs-dialog font-bold text-ink leading-sub mt-s4 whitespace-pre-line [text-wrap:pretty]">{c.text}</div>}

        {hasMore && (
          // Reader L762–767
          <button type="button" aria-expanded={expanded} onClick={() => onToggle(!expanded)}
            className="flex items-center gap-s4 w-full mt-s7 pt-option-y px-0 pb-0 border-t border-tile-v bg-transparent text-fs-sm font-bold text-violet cursor-pointer text-start">
            <span className="flex-1">جزئیات</span>
            <Icon d={expanded ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} px={15} stroke={2.4} className="flex-none" />
          </button>
        )}

        {expanded && (<>
        {!own && <div className="text-fs-sm text-muted mt-s6">نوشتهٔ {c.author.name}</div>}

        {notes.length > 0 && (
          <div className="flex flex-col gap-s7 mt-s8">
            {notes.map((n, i) => (
              <div key={i} className={`ps-s7 border-s-note ${n.tone}`}>
                <div className="text-fs-sm2 font-bold text-muted">{n.by}</div>
                <div className="text-fs-lg text-ink-current leading-loose mt-s2 whitespace-pre-line [text-wrap:pretty]">{n.text}</div>
              </div>
            ))}
          </div>
        )}

        {info && (
          <div className="flex items-start gap-s5 mt-s8 p-s7 bg-surface-sub rounded-tile">
            <svg aria-hidden width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" className="flex-none mt-half text-muted">
              <circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" />
            </svg>
            <div className="text-fs-body text-ink-current leading-loose [text-wrap:pretty]">{info}</div>
          </div>
        )}
        </>)}

        {c.actions.approve && (
          <>
            {mode === 'note' && area('یادداشت شما کنار کامنت او اضافه می‌شود…', 4)}
            {mode === 'reject' && area('چرا قبول ندارید؟', 3, true)}
            {mode === null && (
              <>
                <button type="button" onClick={askApprove}
                  className="w-full mt-s8 p-s8 border-0 rounded-tile bg-green text-card font-bold text-fs-compose-reader cursor-pointer shadow-green">
                  تأیید
                </button>
                <div data-r-cmtactions className={`${ROW} mt-s5`}>
                  <button type="button" onClick={() => switchTo('note')} className={`${GHOST} p-s7 text-fs-body-lead`}>افزودن یادداشت</button>
                  {c.actions.reject && <button type="button" onClick={askReject} className={DANGER}>رد کردن</button>}
                </div>
              </>
            )}
            {mode === 'note' && (
              <div data-r-cmtactions className={`${ROW} mt-s6`}>
                <button type="button" onClick={askApprove} className={`${SOLID} bg-green shadow-green`}>ثبت یادداشت و تأیید</button>
                <button type="button" onClick={() => switchTo('note')} className={`${GHOST} p-button-x text-fs-lg`}>انصراف</button>
              </div>
            )}
            {mode === 'reject' && (
              <div data-r-cmtactions className={`${ROW} mt-s6`}>
                <button type="button" onClick={askReject} className={`${SOLID} bg-coral shadow-coral`}>ثبت</button>
                <button type="button" onClick={() => switchTo('reject')} className={`${GHOST} p-button-x text-fs-lg`}>انصراف</button>
              </div>
            )}
          </>
        )}

        {(c.actions.edit || c.actions.withdraw) && (mode === 'edit' ? (
          <div data-r-cmtactions className={`${ROW} mt-s6`}>
            <button type="button" onClick={saveEdit} disabled={busy} className={`${SOLID} bg-violet shadow-violet`}>دوباره بفرست</button>
            <button type="button" onClick={() => switchTo('edit')} className={`${GHOST} p-button-x text-fs-lg`}>انصراف</button>
          </div>
        ) : (
          <div data-r-cmtactions className={`${ROW} mt-s6`}>
            {c.actions.edit && (
              <button type="button" onClick={() => switchTo('edit', c.text)} className={`${GHOST} p-s7 text-fs-body-lead`}>عوض کردن متن</button>
            )}
            {c.actions.withdraw && (
              <button type="button" disabled={busy} className={DANGER} onClick={() => setAsk('withdraw')}>
                پس گرفتن
              </button>
            )}
          </div>
        ))}
      </div>

      {ask && <DecisionModal kind={ask} pending={busy} onConfirm={confirm} onClose={() => setAsk(null)} />}
    </div>
  )
}
